// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture, renders it
// twice, then freezes it and sets window.__shotReady.
// SANDLINE: Jackals (you + 3 bots) plant the charge at A or B; Wardens (4 bots) stop them.
// The screens first: start screen and lobby lead the entry, the sim follows.
import { createLobby } from './lobby.js';
import { createMapSwitch } from './maps.js';
import { createDeathmatch, TDM_TARGET } from './deathmatch.js';
import { createSettings } from './settings.js';
import { createResults } from './results.js';
import { createStats } from './stats.js';
import { passiveFor, applyPassiveStep } from './passives.js';
import { combatHooks } from './combat.js';
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, clamp } from './rng.js';
import { createMatchState, PHASE, TEAM, TUNE, aliveCount, awardMoney, pushEvent, pushNoise } from './state.js';
import { createWorld, SPAWNS, siteAt } from './world.js';
import { createAudio } from './audio.js';
import { createCombat } from './combat.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createBot, botDisplayName } from './bot.js';
import { WEAPONS, GRENADES, BUY_MENU, createWeaponState, createViewModel, weaponReady, weaponReload, weaponFire, weaponSpread, weaponStep } from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));
// Phones cap the pixel ratio: a 3x phone panel costs real GPU for no visible gain.
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const state = createMatchState();
const world = createWorld(scene);
const audio = createAudio();
const combat = createCombat(scene, world, state, audio, random);
const hud = createHud();
hud.onBuy((itemId) => buyItem(itemId));
const lobby = createLobby({
  onStart: () => beginMatch(),
  onBack: () => {
    lobby.close();
    lobbyOpen = false;
    hud.showOverlay('start');
  },
});
const maps = createMapSwitch(scene, world);
const stats = createStats(state);
combatHooks.onDamage = (shooter, target) => stats.damaged(shooter, target);
const settings = createSettings({
  audio,
  onQuality: (quality) => {
    renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
  },
});
settings.apply();
const results = createResults({
  stats,
  nameOf: (actor) => botDisplayName(actor),
  onPlayAgain: () => {
    results.hide();
    resetMatch();
    beginMatch();
  },
  onBackToLobby: () => {
    results.hide();
    resetMatch();
    enterLobby();
  },
});
const tdm = createDeathmatch({
  state,
  nameOf: (actor) => botDisplayName(actor),
  respawnActor: (actor) => respawnActor(actor),
  onMatchEnd: () => endMatch(),
});
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange, {
  onSwap: () => switchWeapon(playerActor.weapon.def.id === 'pistol' ? 1 : 2),
  onPause: () => hud.showOverlay('paused'),
});
const raycaster = new THREE.Raycaster();
raycaster.far = 140;

const direction = new THREE.Vector3();
const eyePos = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();

// ---- Actors: you (Jackals) + 3 friendly bots vs 4 Warden bots ----
function makeActor(id, team, slot, isPlayer) {
  return {
    id, team, slot, isPlayer,
    alive: true, health: TUNE.playerHealth,
    pos: new THREE.Vector3(0, 0, 0), yaw: 0,
    weapon: null, weapons: {},
    money: TUNE.startMoney,
    loadout: { primary: 'rifle', grenades: { frag: 0, smoke: 0 } },
    kills: 0, deaths: 0, shots: 0, hits: 0, bot: null,
  };
}
const playerActor = makeActor(0, TEAM.JACKALS, 0, true);
playerActor.pos = player.state.position;
const botActors = [];
const bots = [];
for (let i = 0; i < 3; i += 1) botActors.push(makeActor(10 + i, TEAM.JACKALS, i + 1, false));
for (let i = 0; i < 4; i += 1) botActors.push(makeActor(20 + i, TEAM.WARDENS, i, false));
state.actors = [playerActor, ...botActors];

const botDeps = {
  world, combat, state, audio, random,
  onKill: handleKill,
  onHit: handleHit,
  onShot: (actor, x, z) => pushNoise(state, x, z, true),
  onShotFired: (actor, hit) => stats.shot(actor, hit),
  onChannelStart: handleChannelStart,
};
for (const actor of botActors) bots.push(createBot(scene, actor, botDeps));

// ---- View model (the gun in your hands) ----
let viewModel = null;
function setViewModel(weaponId) {
  if (viewModel) viewModel.dispose();
  viewModel = createViewModel(camera, weaponId);
}

// ---- Round flow ----
let started = false;
let frozen = false;
let lobbyOpen = false; // the lobby holds the match: nothing steps while it is up
let lobbyShown = false; // the lobby opens once per match, before round 1
let matchMode = 'plant'; // 'plant' rounds or 'tdm' first-to-20
let matchMap = 'yard9'; // 'yard9' dusk or 'yard10' night
let currentPassive = passiveFor('YOU');
let roundLog = []; // { label } per finished round, for the results screen
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let plantProgress = 0; // your own plant, 0..1
let lastBeepAt = -10;
let stepCount = 0;
let spectate = null; // bot actor the death camera follows
let carrier = null; // Jackal bot carrying the charge
let channeling = null; // { actor, kind, site, progress }
let footstepAt = 0;

function resetMatch() {
  state.phase = PHASE.BUY;
  state.round = 1;
  state.score = [0, 0];
  state.matchWinner = -1;
  state.events = [];
  state.noise = [];
  lobbyShown = false;
  stats.reset();
  roundLog = [];
  results.hide();
  tdm.stop();
  for (const actor of state.actors) {
    actor.money = TUNE.startMoney;
    actor.kills = 0;
    actor.deaths = 0;
    actor.loadout = { primary: 'rifle', grenades: { frag: 0, smoke: 0 } };
  }
  playerActor.weapons = {};
  setupRound();
}

function setupRound() {
  state.phase = PHASE.BUY;
  state.phaseTime = TUNE.buyTime;
  state.roundTimeLeft = TUNE.roundTime;
  if (matchMode === 'tdm') state.roundTimeLeft = 9999; // deathmatch has no round clock
  state.plant = null;
  state.charge = null;
  state.winner = -1;
  state.winReason = '';
  plantProgress = 0;
  channeling = null;
  spectate = null;
  // Spawn everyone.
  const jackalSpawns = SPAWNS.jackals;
  const wardenSpawns = SPAWNS.wardens;
  let ji = 0;
  let wi = 0;
  for (const actor of state.actors) {
    actor.alive = true;
    actor.health = TUNE.playerHealth;
    const spawn = actor.team === TEAM.JACKALS ? jackalSpawns[ji++] : wardenSpawns[wi++];
    if (actor.isPlayer) {
      player.state.position.set(spawn.x, 0, spawn.z);
      player.state.velocity.set(0, 0, 0);
      player.state.yaw = 0;
      player.state.pitch = 0;
    } else {
      actor.bot.reset(spawn.x, spawn.z, actor.team === TEAM.JACKALS ? 0 : Math.PI);
    }
  }
  if (currentPassive.health) playerActor.health = TUNE.playerHealth + currentPassive.health;
  // Weapons: you keep what you bought; bots buy fresh.
  if (!playerActor.weapons[playerActor.loadout.primary]) {
    playerActor.weapons[playerActor.loadout.primary] = createWeaponState(playerActor.loadout.primary);
  }
  playerActor.weapons.pistol = playerActor.weapons.pistol || createWeaponState('pistol');
  playerActor.weapon = playerActor.weapons[playerActor.loadout.primary];
  setViewModel(playerActor.loadout.primary);
  for (const bot of bots) {
    bot.buy();
    bot.roundSetup(state.round, random);
  }
  // One Jackal bot carries the charge — plant mode only; deathmatch has none.
  if (matchMode !== 'tdm') {
    const jackalBots = botActors.filter((a) => a.team === TEAM.JACKALS);
    carrier = jackalBots[Math.floor(random() * jackalBots.length)];
    for (const bot of jackalBots) bot.bot.brain.isCarrier = bot === carrier;
  } else {
    carrier = null;
  }
  if (!shot) hud.showBuy(playerActor, state.round);
  hud.setScore(state.score, state.round);
  hud.setHealth(playerActor.health);
  hud.setMoney(playerActor.money);
  hud.setAmmo(playerActor.weapon.mag, playerActor.weapon.reserve, playerActor.weapon.def.name);
  hud.setGrenades(playerActor.loadout.grenades.frag, playerActor.loadout.grenades.smoke);
}

function startRound() {
  state.phase = PHASE.LIVE;
  state.phaseTime = 0;
  // Deathmatch keeps the 9999 set by setupRound: no round clock there.
  if (matchMode !== 'tdm') state.roundTimeLeft = TUNE.roundTime;
  hud.hideBuy();
  hud.showBanner(`ROUND ${state.round}`, 'Plant the charge at A or B — or eliminate the Wardens');
  audio.buy();
}

function endRound(winner, reason) {
  if (state.phase !== PHASE.LIVE) return;
  state.phase = PHASE.ROUND_END;
  state.phaseTime = TUNE.roundEndTime;
  state.winner = winner;
  state.winReason = reason;
  state.score[winner] += 1;
  roundLog.push({ label: `Round ${state.round} — ${winner === TEAM.JACKALS ? 'Jackals' : 'Wardens'} · ${reason}` });
  awardMoney(state, winner, TUNE.winMoney);
  awardMoney(state, 1 - winner, TUNE.lossMoney);
  channeling = null;
  hud.hideChannel();
  hud.hidePrompt();
  const youWon = winner === TEAM.JACKALS;
  hud.showBanner(
    youWon ? 'JACKALS TAKE THE ROUND' : 'WARDENS TAKE THE ROUND',
    `${reason} · ${state.score[0]} — ${state.score[1]}`,
    3600,
  );
  audio.roundEnd(youWon);
  hud.setScore(state.score, state.round);
  hud.setMoney(playerActor.money);
}

function endMatch() {
  state.phase = PHASE.MATCH_END;
  const winner = state.score[0] > state.score[1] ? TEAM.JACKALS : TEAM.WARDENS;
  state.matchWinner = winner;
  tdm.stop();
  if (document.pointerLockElement) document.exitPointerLock();
  // The results screen takes over from here; the match-end overlay stays
  // hidden while it is open (onLockChange guards the desktop path).
  results.show({
    winner,
    score: [state.score[0], state.score[1]],
    mode: matchMode,
    rounds: matchMode === 'tdm'
      ? [{ label: `Deathmatch — first to ${TDM_TARGET} · ${state.score[0]} — ${state.score[1]}` }]
      : roundLog,
    actors: state.actors,
  });
  // Touch has no pointer lock to lose, so the overlay never arrives via
  // onLockChange: show it here instead — unless results already took over.
  if (input.isTouch && !results.isOpen) {
    hud.showOverlay('matchEnd', `${winner === TEAM.JACKALS ? 'Jackals' : 'Wardens'} win the match ${state.score[0]} — ${state.score[1]}.`);
  }
}

function nextRound() {
  if (state.score[0] >= TUNE.roundsToWin || state.score[1] >= TUNE.roundsToWin || state.round >= TUNE.maxRounds) {
    endMatch();
    return;
  }
  state.round += 1;
  setupRound();
}

// ---- Kills, hits, channels ----
function handleKill(shooter, target, headshot) {
  const sName = botDisplayName(shooter);
  const tName = botDisplayName(target);
  pushEvent(state, `${sName} ▸ ${tName}${headshot ? ' [HEADSHOT]' : ''}`, shooter.team);
  hud.killfeed(`${sName} ▸ ${tName}${headshot ? ' [HEADSHOT]' : ''}`, shooter.team);
  shooter.kills += 1;
  target.deaths += 1;
  stats.killed(shooter, target);
  tdm.onKill(shooter, target);
  if (tdm.active) tdm.refreshBoard();
  if (shooter) shooter.money = Math.min(TUNE.maxMoney, shooter.money + TUNE.killMoney);
  if (shooter === playerActor) {
    hud.setMoney(playerActor.money);
    audio.kill();
  }
  if (target === playerActor) {
    audio.hurt();
    hud.flashDamage();
    const alive = botActors.filter((a) => a.team === TEAM.JACKALS && a.alive);
    spectate = alive.length ? alive[Math.floor(random() * alive.length)] : null;
  }
  if (target === carrier && !state.charge) {
    const alive = botActors.filter((a) => a.team === TEAM.JACKALS && a.alive);
    carrier = alive.length ? alive[Math.floor(random() * alive.length)] : null;
    if (carrier) carrier.bot.brain.isCarrier = true;
  }
  if (target.bot) target.bot.brain.channel = null;
  checkRoundEnd();
}

function handleHit(target, headshot) {
  if (target === playerActor) {
    // Captures are staged: the player cannot die mid-shot, or the frame is a death cam.
    if (shot) target.health = 100;
    hud.flashDamage();
    audio.hurt();
  }
}

function handleChannelStart(actor, kind, site) {
  if (channeling) return;
  channeling = { actor, kind, site, progress: 0 };
}

function plantCharge(site, x, z) {
  state.charge = { site: site.name, x, z, detonateIn: TUNE.detonateTime, defuse: null };
  state.plant = { site: site.name, x, z };
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.25, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), emissive: new THREE.Color(PALETTE.danger), emissiveIntensity: 0.8 }),
  );
  mesh.position.set(x, 0.15, z);
  scene.add(mesh);
  state.charge.mesh = mesh;
  hud.showBanner(`CHARGE PLANTED — SITE ${site.name}`, 'Wardens must defuse before it blows', 3200);
  audio.plantBeep(true);
}

function checkRoundEnd() {
  if (state.phase !== PHASE.LIVE) return;
  if (matchMode === 'tdm') return; // deathmatch ends on kills, never on wipe
  const j = aliveCount(state, TEAM.JACKALS);
  const w = aliveCount(state, TEAM.WARDENS);
  if (state.charge) {
    if (w === 0) {
      // Nobody left to defuse: the charge blows soon.
      state.charge.detonateIn = Math.min(state.charge.detonateIn, 2);
    }
    return;
  }
  if (j === 0 && w === 0) endRound(TEAM.WARDENS, 'Both teams eliminated');
  else if (j === 0) endRound(TEAM.WARDENS, 'Jackals eliminated');
  else if (w === 0) endRound(TEAM.JACKALS, 'Wardens eliminated');
}

// ---- Player actions ----
function syncCamera() {
  if (playerActor.alive) {
    camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
    camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  } else if (spectate && spectate.alive) {
    camera.position.set(spectate.pos.x, spectate.pos.y + 1.5, spectate.pos.z);
    camera.rotation.set(0, spectate.yaw, 0, 'YXZ');
  }
}

function aimAt(point) {
  const dx = point.x - player.state.position.x;
  const dy = point.y - (player.state.position.y + player.state.eye);
  const dz = point.z - player.state.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(clamp(dy / length, -1, 1));
  syncCamera();
}

function playerShoot() {
  const w = playerActor.weapon;
  if (!w || !weaponReady(w)) {
    if (w && w.mag === 0 && w.reloadLeft === 0) audio.dryFire();
    return;
  }
  const def = w.def;
  const aiming = input.state.aiming;
  const spread = weaponSpread(def, player.groundSpeed(), player.state.crouching) * (aiming ? 0.6 : 1);
  weaponFire(w);
  camera.getWorldDirection(direction);
  eyePos.copy(camera.position);
  muzzlePos.copy(camera.position).addScaledVector(direction, 0.6);
  muzzlePos.x += Math.cos(player.state.yaw) * 0.2;
  muzzlePos.z -= Math.sin(player.state.yaw) * 0.2;
  const pellets = def.pellets || 1;
  let scored = false;
  for (let p = 0; p < pellets; p += 1) {
    const result = combat.fireHitscan(eyePos, direction, spread, random, def.range);
    combat.showTracer(muzzlePos, result.point, def.tracer);
    if (result.actor && result.actor !== playerActor) {
      const amount = def.damage * (result.part === 'head' ? def.headMult : 1);
      const killed = combat.damageActor(playerActor, result.actor, amount, result.part, handleKill, handleHit);
      hud.hitMarker(killed, shot ? 4000 : 90);
      audio.hit(result.part === 'head');
      scored = true;
      break;
    }
  }
  stats.shot(playerActor, scored);
  audio.shot(def.id, false);
  pushNoise(state, player.state.position.x, player.state.position.z, true);
  player.recoil(def.recoil * (0.8 + random() * 0.4), (random() * 2 - 1) * def.recoil * 0.35);
  hud.setAmmo(w.mag, w.reserve, def.name);
}

function playerThrowGrenade(kind) {
  const count = playerActor.loadout.grenades[kind];
  if (!count) return;
  playerActor.loadout.grenades[kind] = count - 1;
  camera.getWorldDirection(direction);
  eyePos.copy(camera.position);
  combat.throwGrenade(kind, eyePos, direction, playerActor);
  hud.setGrenades(playerActor.loadout.grenades.frag, playerActor.loadout.grenades.smoke);
}

function buyItem(itemId) {
  if (state.phase !== PHASE.BUY) return;
  const def = WEAPONS[itemId] || GRENADES[itemId];
  if (!def) return;
  if (itemId === 'frag' || itemId === 'smoke') {
    if (playerActor.loadout.grenades[itemId] > 0) return;
    if (playerActor.money < def.price) return;
    playerActor.money -= def.price;
    playerActor.loadout.grenades[itemId] = 1;
  } else {
    if (playerActor.loadout.primary === itemId) return;
    if (playerActor.money < def.price) return;
    playerActor.money -= def.price;
    playerActor.loadout.primary = itemId;
    if (!playerActor.weapons[itemId]) playerActor.weapons[itemId] = createWeaponState(itemId);
    playerActor.weapon = playerActor.weapons[itemId];
    setViewModel(itemId);
  }
  audio.buy();
  hud.setMoney(playerActor.money);
  hud.setAmmo(playerActor.weapon.mag, playerActor.weapon.reserve, playerActor.weapon.def.name);
  hud.setGrenades(playerActor.loadout.grenades.frag, playerActor.loadout.grenades.smoke);
  hud.refreshBuy(playerActor);
}

function switchWeapon(slot) {
  if (slot === 1 && playerActor.loadout.primary !== playerActor.weapon.def.id) {
    playerActor.weapon = playerActor.weapons[playerActor.loadout.primary];
    setViewModel(playerActor.loadout.primary);
  } else if (slot === 2 && playerActor.weapon.def.id !== 'pistol') {
    playerActor.weapon = playerActor.weapons.pistol;
    setViewModel('pistol');
  }
  hud.setAmmo(playerActor.weapon.mag, playerActor.weapon.reserve, playerActor.weapon.def.name);
}

function handlePressed() {
  for (const code of input.state.pressed) {
    if (code === 'KeyB' && state.phase === PHASE.BUY) {
      if (document.getElementById('buy').hidden) hud.showBuy(playerActor, state.round);
      else hud.hideBuy();
    }
    if (state.phase === PHASE.BUY) {
      for (const item of BUY_MENU) {
        if (code === `Digit${item.key}`) buyItem(item.id);
      }
    }
    if (state.phase === PHASE.LIVE && playerActor.alive) {
      if (code === 'Digit1') switchWeapon(1);
      else if (code === 'Digit2') switchWeapon(2);
      else if (code === 'Digit3' || code === 'KeyG') playerThrowGrenade('frag');
      else if (code === 'Digit4' || code === 'KeyF') playerThrowGrenade('smoke');
      else if (code === 'KeyR') {
        if (weaponReload(playerActor.weapon)) audio.reload();
      }
    }
  }
  input.state.pressed.clear();
}

// ---- Plant / defuse channels, run in the fixed step ----
function stepChannels(dt) {
  // Your plant: hold E inside a site. Plant mode only — deathmatch has no charge.
  if (state.phase === PHASE.LIVE && playerActor.alive && !state.charge && playerActor.team === TEAM.JACKALS && matchMode !== 'tdm') {
    const site = siteAt(player.state.position.x, player.state.position.z);
    if (site && input.state.keys.has('KeyE')) {
      plantProgress += dt / TUNE.plantTime;
      hud.setChannel(`Planting charge — Site ${site.name}`, Math.min(1, plantProgress));
      if (plantProgress >= 1) {
        plantProgress = 0;
        hud.hideChannel();
        playerActor.money = Math.min(TUNE.maxMoney, playerActor.money + TUNE.plantMoney);
        hud.setMoney(playerActor.money);
        plantCharge(site, player.state.position.x, player.state.position.z);
      }
    } else {
      if (plantProgress > 0) {
        plantProgress = Math.max(0, plantProgress - dt * 2);
        if (plantProgress === 0) hud.hideChannel();
        else hud.setChannel('Planting charge', plantProgress);
      }
      if (site && !state.charge) hud.showPrompt('Hold E to plant the charge');
      else hud.hidePrompt();
    }
  } else if (plantProgress > 0) {
    plantProgress = 0;
    hud.hideChannel();
  }

  // A bot's channel (plant or defuse).
  if (channeling) {
    const { actor, kind } = channeling;
    const alive = actor.alive && actor.bot && actor.bot.brain.channel === kind;
    if (!alive) {
      channeling = null;
      hud.hideChannel();
    } else {
      channeling.progress += dt / (kind === 'plant' ? TUNE.plantTime : TUNE.defuseTime);
      if (kind === 'plant') audio.plantBeep(false);
      else if (Math.floor(channeling.progress * 10) !== Math.floor((channeling.progress - dt / TUNE.defuseTime) * 10)) audio.defuseBeep();
      if (channeling.progress >= 1) {
        if (kind === 'plant') {
          const site = channeling.site;
          plantCharge(site, actor.pos.x, actor.pos.z);
          actor.money = Math.min(TUNE.maxMoney, actor.money + TUNE.plantMoney);
        } else {
          // Defused: the charge is gone, Wardens take the round.
          if (state.charge && state.charge.mesh) scene.remove(state.charge.mesh);
          state.charge = null;
          state.plant = null;
          endRound(TEAM.WARDENS, 'Charge defused');
        }
        channeling = null;
        hud.hideChannel();
      }
    }
  }

  // The planted charge ticks down; its beep quickens as it nears zero.
  if (state.charge && state.phase === PHASE.LIVE) {
    const charge = state.charge;
    charge.detonateIn -= dt;
    const gap = Math.max(0.3, charge.detonateIn / 35);
    if (state.time - lastBeepAt >= gap) {
      lastBeepAt = state.time;
      audio.plantBeep(false);
    }
    if (charge.detonateIn <= 0) {
      audio.explosion();
      if (charge.mesh) scene.remove(charge.mesh);
      state.charge = null;
      state.plant = null;
      endRound(TEAM.JACKALS, 'Charge detonated');
    }
  }
}

// ---- Fixed step ----
function step(dt) {
  state.time += dt;
  stepCount += 1;
  elapsed += dt;
  tdm.step();

  if (state.phase === PHASE.BUY) {
    state.phaseTime -= dt;
    if (state.phaseTime <= 0) startRound();
  } else if (state.phase === PHASE.LIVE) {
    state.roundTimeLeft -= dt;
    if (state.roundTimeLeft <= 0 && !state.charge && matchMode !== 'tdm') endRound(TEAM.WARDENS, 'Time expired — Wardens hold');
  } else if (state.phase === PHASE.ROUND_END) {
    state.phaseTime -= dt;
    if (state.phaseTime <= 0) nextRound();
  }

  if (state.phase === PHASE.LIVE || state.phase === PHASE.BUY) {
    player.step(dt, input.state.keys);
    if (playerActor.weapon) {
      weaponStep(playerActor.weapon, dt);
      applyPassiveStep(playerActor.weapon, currentPassive, dt);
    }
    for (const bot of bots) bot.step(dt);
    stepChannels(dt);
    combat.step(dt, handleKill, handleHit);
  }

  // Footsteps for you, on the ground and moving.
  if (playerActor.alive && player.groundSpeed() > 1 && player.state.onGround && state.time - footstepAt > 0.36) {
    footstepAt = state.time;
    audio.step();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && !lobbyOpen) {
    const look = input.takeLook();
    look.x *= settings.values.sens;
    look.y *= settings.values.sens;
    const sensitivity = input.state.aiming ? 0.0013 : 0.0022;
    player.look(look.x, look.y, sensitivity);
    handlePressed();
    if (state.phase === PHASE.LIVE && playerActor.alive) {
      if (input.state.firing && playerActor.weapon && weaponReady(playerActor.weapon)) playerShoot();
      else if (input.state.firing && playerActor.weapon && playerActor.weapon.mag === 0) {
        if (weaponReload(playerActor.weapon)) audio.reload();
      }
      if (input.state.keys.has('KeyR') && playerActor.weapon) {
        if (weaponReload(playerActor.weapon)) audio.reload();
      }
    } else if (state.phase === PHASE.BUY && playerActor.alive) {
      // Warm-up: you can shoot during the buy phase, nobody shoots back yet.
      if (input.state.firing && playerActor.weapon && weaponReady(playerActor.weapon)) playerShoot();
      if (input.state.keys.has('KeyR') && playerActor.weapon) {
        if (weaponReload(playerActor.weapon)) audio.reload();
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // ADS: narrow the field of view while the right mouse is held.
    const targetFov = input.state.aiming && playerActor.weapon
      ? (playerActor.weapon.def.scopeFov || 55) : 74;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
  }
  // HUD sync, once a frame.
  if (playerActor.weapon) {
    hud.setAmmo(playerActor.weapon.mag, playerActor.weapon.reserve, playerActor.weapon.def.name);
    hud.setCrosshair(weaponSpread(playerActor.weapon.def, player.groundSpeed(), player.state.crouching) * 900 + 6);
  }
  hud.setHealth(playerActor.health);
  hud.setTimer(state.phase === PHASE.BUY ? state.phaseTime : state.charge ? state.charge.detonateIn : Math.max(0, state.roundTimeLeft), state.phase);
  hud.setAlive(aliveCount(state, TEAM.JACKALS), aliveCount(state, TEAM.WARDENS));
  if (matchMode === 'tdm') hud.setTdmScore(state.score[0], state.score[1]);
  renderer.render(scene, camera);
}

// ---- Overlays / pointer lock ----
// From the start screen, the first Play of a match opens the lobby; resumes
// and later rounds go straight in.
function enterLobby() {
  if (state.phase !== PHASE.BUY) resetMatch();
  state.phaseTime = TUNE.buyTime;
  lobbyOpen = true;
  hud.hideOverlay();
  hud.hideBuy();
  lobby.open(false);
}

function beginMatch() {
  lobby.close();
  lobbyOpen = false;
  const sel = lobby.selection();
  matchMode = sel.mode;
  matchMap = sel.map;
  currentPassive = passiveFor(sel.agent);
  player.setSpeedMul(currentPassive.speed);
  hud.setMatchMode(matchMode);
  if (matchMode === 'tdm') tdm.start();
  else tdm.stop();
  if (matchMap !== maps.current) {
    maps.switchTo(matchMap);
    setupRound();
  }
  if (state.phase === PHASE.MATCH_END) resetMatch();
  else if (state.phase === PHASE.ROUND_END) nextRound();
  if (state.phase === PHASE.BUY) {
    state.phaseTime = TUNE.buyTime;
    hud.showBuy(playerActor, state.round);
  }
  hud.hideOverlay();
  // Touch has no pointer lock: the tap itself starts the game.
  if (input.isTouch) started = true;
  else input.requestLock();
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === PHASE.MATCH_END) {
    resetMatch();
  } else if (state.phase === PHASE.ROUND_END) {
    nextRound();
  }
  if (!lobbyShown && state.phase === PHASE.BUY && state.round === 1) {
    lobbyShown = true;
    enterLobby();
    return;
  }
  hud.hideOverlay();
  // Touch has no pointer lock: the tap itself starts the game.
  if (input.isTouch) started = true;
  else input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (state.phase === PHASE.MATCH_END) {
    if (results.isOpen) return; // the results screen owns the end of a match
    hud.showOverlay('matchEnd', `${state.matchWinner === TEAM.JACKALS ? 'Jackals' : 'Wardens'} win the match ${state.score[0]} — ${state.score[1]}.`);
  } else if (state.phase === PHASE.ROUND_END) {
    hud.showOverlay('roundEnd', `${state.winReason} · ${state.score[0]} — ${state.score[1]}`);
  } else if (started) {
    hud.showOverlay('paused');
  } else {
    hud.showOverlay('start');
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Deathmatch respawns: back at your own base, weapon refilled ----
function respawnActor(actor) {
  const spawns = actor.team === TEAM.JACKALS ? SPAWNS.jackals : SPAWNS.wardens;
  const pick = spawns[actor.slot % spawns.length];
  actor.alive = true;
  actor.health = TUNE.playerHealth + (actor.isPlayer ? currentPassive.health : 0);
  if (actor.isPlayer) {
    player.state.position.set(pick.x, 0, pick.z);
    player.state.velocity.set(0, 0, 0);
    player.state.yaw = actor.team === TEAM.JACKALS ? 0 : Math.PI;
    player.state.pitch = 0;
    spectate = null;
    if (playerActor.weapon) {
      playerActor.weapon.mag = playerActor.weapon.def.mag;
      playerActor.weapon.reserve = playerActor.weapon.def.reserve;
      playerActor.weapon.reloadLeft = 0;
    }
    hud.setHealth(playerActor.health);
  } else {
    actor.bot.reset(pick.x, pick.z, actor.team === TEAM.JACKALS ? 0 : Math.PI);
    actor.weapon = createWeaponState(actor.loadout.primary);
  }
}

// ---- Deterministic captures: ?shot=start|play|end&seed=N ----
function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function nearestEnemy() {
  let best = null;
  let bestD = Infinity;
  for (const actor of botActors) {
    if (!actor.alive || actor.team === TEAM.JACKALS) continue;
    const dx = actor.pos.x - player.state.position.x;
    const dz = actor.pos.z - player.state.position.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = actor; }
  }
  return best;
}

function showResultsShot() {
  hud.hideOverlay();
  resetMatch();
  const fixed = [
    [14, 6, 3, 96], [9, 8, 2, 55], [7, 9, 4, 61], [6, 7, 1, 49],
    [11, 10, 2, 58], [8, 11, 1, 52], [5, 12, 3, 44], [4, 13, 0, 41],
  ];
  state.actors.forEach((actor, i) => {
    const [kills, deaths, assists, acc] = fixed[i];
    actor.kills = kills;
    actor.deaths = deaths;
    const shots = 50;
    stats.setRow(actor, shots, Math.round((shots * acc) / 100), assists);
  });
  state.score = [5, 3];
  roundLog = [
    { label: 'Round 1 — Jackals · Wardens eliminated' },
    { label: 'Round 2 — Wardens · Charge defused' },
    { label: 'Round 3 — Jackals · Charge detonated' },
    { label: 'Round 4 — Jackals · Wardens eliminated' },
    { label: 'Round 5 — Wardens · Time expired' },
    { label: 'Round 6 — Jackals · Charge detonated' },
    { label: 'Round 7 — Wardens · Jackals eliminated' },
    { label: 'Round 8 — Jackals · Charge detonated' },
  ];
  results.show({
    winner: TEAM.JACKALS,
    score: [5, 3],
    mode: 'plant',
    rounds: roundLog,
    actors: state.actors,
  });
  hud.setScore(state.score, state.round);
  hud.setHealth(playerActor.health);
  hud.setMoney(playerActor.money);
  paintTwiceThenReady();
}

function runShot(name) {
  hud.hideOverlay();
  resetMatch();
  if (name === 'lobby') {
    // The pre-match lobby: your agent on the turntable, both rosters.
    // Still frames only: the showcase loop never starts in a capture.
    if (state.phase !== PHASE.BUY) resetMatch();
    state.phaseTime = TUNE.buyTime;
    lobbyOpen = true;
    hud.hideOverlay();
    hud.hideBuy();
    const pickMap = params.get('map');
    const pickMode = params.get('mode');
    lobby.setSelection({
      map: pickMap === 'yard10' ? 'yard10' : 'yard9',
      mode: pickMode === 'tdm' ? 'tdm' : 'plant',
      agent: 0,
    });
    lobby.open(true);
    paintLobbyShot();
    return;
  }
  if (name === 'start') {
    // The title screen over the yard at the Jackals spawn: the SANDLINE panel,
    // the objective and the keys, with the buy-phase scene behind it.
    player.state.position.set(0, 0, 19);
    player.state.yaw = 0.3;
    player.state.pitch = 0;
    settle(20);
    hud.showOverlay('start');
  } else if (name === 'play') {
    // Skip the buy: 6 seconds of a mid-lane firefight, scripted.
    startRound();
    input.state.keys.add('KeyW');
    for (let i = 0; i < 360; i += 1) {
      const enemy = nearestEnemy();
      if (enemy) aimAt(new THREE.Vector3(enemy.pos.x, enemy.pos.y + 1.2, enemy.pos.z));
      if (i === 240) input.state.keys.delete('KeyW');
      if (i >= 240 && playerActor.weapon && weaponReady(playerActor.weapon)) playerShoot();
      step(FIXED_STEP);
      if (!playerActor.alive) break;
    }
    input.state.keys.delete('KeyW');
    hud.hideBanner();
    // One last aimed shot so the tracer and hitmarker are in the frame.
    const enemy = nearestEnemy();
    if (enemy && playerActor.alive) {
      aimAt(new THREE.Vector3(enemy.pos.x, enemy.pos.y + 1.2, enemy.pos.z));
      if (playerActor.weapon.mag === 0) playerActor.weapon.mag = playerActor.weapon.def.mag;
      playerShoot();
      settle(2);
    }
  } else if (name === 'night') {
    // Yard 10 at night: the same scripted firefight, under floodlights.
    // A short walk only: the frame should show the lit yard, not a corridor.
    matchMap = 'yard10';
    maps.switchTo('yard10');
    setupRound();
    startRound();
    input.state.keys.add('KeyW');
    for (let i = 0; i < 360; i += 1) {
      const enemy = nearestEnemy();
      if (enemy) aimAt(new THREE.Vector3(enemy.pos.x, enemy.pos.y + 1.2, enemy.pos.z));
      if (i === 60) input.state.keys.delete('KeyW');
      if (i >= 60 && playerActor.weapon && weaponReady(playerActor.weapon)) playerShoot();
      step(FIXED_STEP);
      if (!playerActor.alive) break;
    }
    input.state.keys.delete('KeyW');
    hud.hideBanner();
    const nightEnemy = nearestEnemy();
    if (nightEnemy && playerActor.alive) {
      aimAt(new THREE.Vector3(nightEnemy.pos.x, nightEnemy.pos.y + 1.2, nightEnemy.pos.z));
      if (playerActor.weapon.mag === 0) playerActor.weapon.mag = playerActor.weapon.def.mag;
      playerShoot();
      settle(2);
    }
  } else if (name === 'results') {
    // A finished match, fixed numbers: the results table and the MVP.
    showResultsShot();
    return;
  } else {
    // Charge planted at A, the defuser already down, you covering the site.
    startRound();
    plantCharge({ name: 'A' }, -24, -14);
    state.charge.detonateIn = 8;
    const defuser = botActors.find((a) => a.team === TEAM.WARDENS && a.alive);
    if (defuser) {
      defuser.bot.reset(-22.5, -12.5, Math.PI * 0.75);
      defuser.alive = false;
      defuser.health = 0;
      defuser.bot.brain.fallT = 1;
      defuser.bot.group.rotation.x = -1.45;
      defuser.bot.group.position.y = -0.08;
    }
    player.state.position.set(-14, 0, -6);
    aimAt(new THREE.Vector3(-23, 1.2, -13));
    // Long duration on purpose: the capture renders twice under SwiftShader
    // before __shotReady fires, and the banner must still be up in the frame.
    hud.showBanner('CHARGE PLANTED — SITE A', '8 seconds to detonation', 60000);
  }
  hud.setScore(state.score, state.round);
  hud.setAmmo(playerActor.weapon.mag, playerActor.weapon.reserve, playerActor.weapon.def.name);
  hud.setHealth(playerActor.health);
  hud.setMoney(playerActor.money);
  hud.setTimer(state.phase === PHASE.BUY ? state.phaseTime : state.charge ? state.charge.detonateIn : Math.max(0, state.roundTimeLeft), state.phase);
  hud.setAlive(aliveCount(state, TEAM.JACKALS), aliveCount(state, TEAM.WARDENS));
  hud.setGrenades(playerActor.loadout.grenades.frag, playerActor.loadout.grenades.smoke);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

// The lobby capture's twin: the main scene behind the panel, plus one still
// frame of the agent stage, then ready.
function paintLobbyShot() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    lobby.paint();
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

resetMatch();
// Test/debug handle (no gameplay effect): probes read player position, yaw and
// ammo through it; the game itself never touches it.
window.__sandline = {
  get pos() { return { x: player.state.position.x, y: player.state.position.y, z: player.state.position.z }; },
  get yaw() { return player.state.yaw; },
  get pitch() { return player.state.pitch; },
  get ammo() { return playerActor.weapon ? playerActor.weapon.mag : -1; },
  get phase() { return state.phase; },
  get health() { return playerActor.health; },
  get mode() { return matchMode; },
  get map() { return matchMap; },
  get score() { return [state.score[0], state.score[1]]; },
  get actors() {
    return state.actors.map((a) => ({ team: a.team, alive: a.alive, kills: a.kills, deaths: a.deaths }));
  },
  input,
};
hud.showOverlay('start');
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
