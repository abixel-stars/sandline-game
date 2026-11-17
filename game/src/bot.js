// Bots: 4v4 teammates and opponents that walk routes, hold angles, push sites,
// plant and defuse, and shoot back with human-like reaction time and error.
// One bot = one mover (shared with the player) + a small state machine.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { TEAM, PHASE, aliveCount } from './state.js';
import { createMover } from './player.js';
import { createWeaponState, weaponReady, weaponReload, weaponFire, weaponStep, WEAPONS } from './weapons.js';
import { nearestWaypoint, findPath, waypoint } from './nav.js';
import { SITES, siteAt } from './world.js';
import { uniformTexture, helmetTexture, skinTexture, trouserTexture, gunMetalTexture } from './textures.js';
import { range } from './rng.js';

// Procedural character textures, cached per team (skin/trousers/gun are shared).
const teamTex = new Map();
const sharedTex = {};
function texturesFor(team) {
  if (!teamTex.has(team)) {
    const teamColor = team === TEAM.JACKALS ? PALETTE.accent : PALETTE.danger;
    teamTex.set(team, {
      uniform: uniformTexture(teamColor),
      helmet: helmetTexture(teamColor),
    });
  }
  if (!sharedTex.skin) {
    sharedTex.skin = skinTexture();
    sharedTex.trousers = trouserTexture();
    sharedTex.gun = gunMetalTexture();
  }
  return { ...teamTex.get(team), ...sharedTex };
}

const BOT_NAMES = {
  0: ['Dune', 'Rook', 'Vex'],      // Jackals
  1: ['Sable', 'Hawk', 'Iris', 'Nox'], // Wardens
};
const WALK_SPEED = 4.3;
const THINK_EVERY = 0.12;
const SEE_RANGE = 60;
const SEE_COS = 0.05; // wide cone; bots also turn to close sounds

export function createBot(scene, actor, deps) {
  const { world, combat, state, audio, random } = deps;
  const teamColor = actor.team === TEAM.JACKALS ? PALETTE.accent : PALETTE.danger;

  // Body: torso, head, legs and a gun, all box-built. Head and torso are the hit meshes.
  // Textured: team uniform with camo, skin, helmet with team band, cloth trousers.
  const tex = texturesFor(actor.team);
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ map: tex.uniform, roughness: 0.85, metalness: 0.0 });
  const darkMat = new THREE.MeshStandardMaterial({ map: tex.trousers, roughness: 0.9, metalness: 0.0 });
  const headMat = new THREE.MeshStandardMaterial({ map: tex.skin, roughness: 0.7, metalness: 0.0 });
  const helmetMat = new THREE.MeshStandardMaterial({ map: tex.helmet, roughness: 0.55, metalness: 0.25 });
  const gunMat = new THREE.MeshStandardMaterial({ map: tex.gun, roughness: 0.45, metalness: 0.5 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), bodyMat);
  torso.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), headMat);
  head.position.y = 1.53;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmetMat);
  helmet.position.y = 1.55;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), darkMat);
  legL.position.set(-0.14, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), gunMat);
  gun.position.set(0.2, 1.15, -0.3);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.32), new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.5 }));
  stripe.position.y = 1.28;
  group.add(torso, head, helmet, legL, legR, gun, stripe);
  group.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; } });
  scene.add(group);
  torso.userData.actor = actor;
  torso.userData.part = 'torso';
  head.userData.actor = actor;
  head.userData.part = 'head';
  combat.registerActor([torso, head]);

  const mover = createMover(world.colliders, actor.pos.x, actor.pos.z);
  actor.pos = mover.state.position; // the one position object, shared with combat
  const brain = {
    mover, group, legL, legR, gun,
    path: new Int16Array(32), pathLen: 0, pathIndex: 0,
    goalNode: -1, mode: 'idle', target: null, targetLostAt: 0,
    reactAt: 0, burstLeft: 0, burstPause: 0, thinkAt: 0,
    holdYaw: 0, holdUntil: 0, lane: 0, isCarrier: false,
    channel: null, // 'plant' | 'defuse' | null
    channelAt: 0, investigateAt: 0, walkPhase: random() * 6.28,
    aimError: 0.02, lastShotAt: 0, dead: false, fallT: 0,
  };

  function faceToward(x, z, rate, dt) {
    const target = Math.atan2(-(x - mover.state.position.x), -(z - mover.state.position.z));
    let diff = target - mover.state.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    mover.state.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function setGoal(node) {
    if (brain.goalNode === node && brain.pathLen > 0) return;
    brain.goalNode = node;
    const from = nearestWaypoint(mover.state.position.x, mover.state.position.z);
    brain.pathLen = findPath(from, node, brain.path);
    brain.pathIndex = brain.pathLen > 1 ? 1 : 0;
    brain.mode = 'move';
  }

  function visibleEnemy() {
    const eye = new THREE.Vector3(mover.state.position.x, mover.state.position.y + 1.5, mover.state.position.z);
    let best = null;
    let bestD = Infinity;
    const fx = -Math.sin(mover.state.yaw);
    const fz = -Math.cos(mover.state.yaw);
    for (const other of state.actors) {
      if (!other.alive || other.team === actor.team || other === actor) continue;
      const dx = other.pos.x - mover.state.position.x;
      const dz = other.pos.z - mover.state.position.z;
      const dy = (other.pos.y + 1.1) - (mover.state.position.y + 1.5);
      const dist = Math.hypot(dx, dy, dz);
      if (dist > SEE_RANGE || dist >= bestD) continue;
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (dot < SEE_COS && dist > 7) continue; // outside the cone, unless very close
      const to = new THREE.Vector3(other.pos.x, other.pos.y + 1.1, other.pos.z);
      if (!combat.hasLOS(eye, to)) continue;
      best = other;
      bestD = dist;
    }
    return best;
  }

  function shootAt(target, dt) {
    const w = actor.weapon;
    if (!w) return;
    weaponStep(w, dt);
    if (brain.burstPause > 0) {
      brain.burstPause -= dt;
      return;
    }
    if (brain.burstLeft <= 0) {
      brain.burstLeft = 3 + Math.floor(random() * 3);
      brain.burstPause = 0.45 + random() * 0.6;
      return;
    }
    if (state.time < brain.reactAt) return;
    if (!weaponReady(w)) {
      if (w.mag === 0 && w.reloadLeft === 0) weaponReload(w);
      return;
    }
    const def = w.def;
    const eye = new THREE.Vector3(mover.state.position.x, mover.state.position.y + 1.5, mover.state.position.z);
    const headAim = random() < 0.12;
    const aimY = target.pos.y + (headAim ? 1.55 : 1.1);
    const dx = target.pos.x - eye.x;
    const dy = aimY - eye.y;
    const dz = target.pos.z - eye.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const dir = new THREE.Vector3(dx / dist, dy / dist, dz / dist);
    // Human error: grows with distance and while the bot is moving.
    const error = (0.012 + dist * 0.0009) * (mover.groundSpeed() > 0.5 ? 1.8 : 1) * (0.6 + random() * 0.8);
    weaponFire(w);
    const pellets = def.pellets || 1;
    let scored = false;
    for (let p = 0; p < pellets; p += 1) {
      const result = combat.fireHitscan(eye, dir, error, random, def.range);
      const muzzle = new THREE.Vector3(eye.x + dir.x * 0.6, eye.y - 0.1, eye.z + dir.z * 0.6);
      combat.showTracer(muzzle, result.point, def.tracer);
      if (result.actor) {
        const amount = def.damage * (result.part === 'head' ? def.headMult : 1);
        combat.damageActor(actor, result.actor, amount, result.part, deps.onKill, deps.onHit);
        scored = true;
        break;
      }
    }
    if (deps.onShotFired) deps.onShotFired(actor, scored);
    audio.shot(def.id, dist > 12);
    deps.onShot(actor, eye.x, eye.z);
    brain.burstLeft -= 1;
    brain.lastShotAt = state.time;
  }

  function step(dt) {
    if (!actor.alive) {
      // Fall over and stay down.
      if (brain.fallT < 1) {
        brain.fallT = Math.min(1, brain.fallT + dt / 0.4);
        group.rotation.x = -brain.fallT * 1.45;
        group.position.y = mover.state.position.y - brain.fallT * 0.08;
      }
      return;
    }
    const pos = mover.state.position;
    actor.yaw = mover.state.yaw;

    // Perception, a few times a second — only once the round is live.
    brain.thinkAt -= dt;
    if (brain.thinkAt <= 0 && state.phase === PHASE.LIVE) {
      brain.thinkAt = THINK_EVERY;
      const seen = visibleEnemy();
      if (seen) {
        if (brain.target !== seen) {
          brain.target = seen;
          brain.reactAt = state.time + 0.35 + random() * 0.35;
          brain.burstLeft = 0;
          brain.burstPause = 0;
        }
        brain.targetLostAt = 0;
        brain.channel = null;
      } else if (brain.target) {
        brain.targetLostAt += THINK_EVERY;
        if (brain.targetLostAt > 1) brain.target = null;
      }
      if (!brain.target) think(dt);
    }

    // Act.
    if (brain.target && brain.target.alive) {
      faceToward(brain.target.pos.x, brain.target.pos.z, 6, dt);
      // Plant/defuse stops the moment an enemy is seen.
      brain.channel = null;
      shootAt(brain.target, dt);
      mover.step(dt, 0, 0, false, false);
    } else if (brain.channel) {
      mover.step(dt, 0, 0, false, false);
    } else if (brain.mode === 'move') {
      const node = waypoint(brain.path[brain.pathIndex]);
      const dx = node.x - pos.x;
      const dz = node.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.7) {
        brain.pathIndex += 1;
        if (brain.pathIndex >= brain.pathLen) {
          brain.mode = 'hold';
          brain.holdUntil = state.time + 2.5;
          if (node.hold !== undefined) brain.holdYaw = node.hold;
        }
      } else {
        faceToward(node.x, node.z, 5, dt);
        mover.step(dt, dx / dist, dz / dist, false, false);
        brain.walkPhase += dt * 9;
      }
    } else {
      // Hold: stand, sweep the angle slowly.
      mover.state.yaw = brain.holdYaw + Math.sin(state.time * 0.5 + brain.walkPhase) * 0.45;
      mover.step(dt, 0, 0, false, false);
    }

    // Animate legs and gun, sync the mesh to the mover.
    const speed = mover.groundSpeed();
    const swing = speed > 0.3 ? Math.sin(brain.walkPhase) * 0.45 : 0;
    brain.legL.rotation.x = swing;
    brain.legR.rotation.x = -swing;
    group.position.set(pos.x, pos.y, pos.z);
    group.rotation.y = mover.state.yaw;
  }

  function think(dt) {
    // Runs when no enemy is visible. Picks the goal for this round state.
    const planted = state.plant !== null;
    if (state.phase !== PHASE.LIVE) {
      brain.mode = 'idle';
      return;
    }
    if (actor.team === TEAM.JACKALS) {
      if (planted) {
        // Hold the planted site.
        setGoal(state.plant.site === 'A' ? 4 : 12);
        return;
      }
      if (brain.isCarrier) {
        const siteNode = brain.lane === 0 ? 4 : brain.lane === 2 ? 12 : (state.round % 2 === 0 ? 4 : 12);
        if (brain.goalNode === siteNode && brain.mode === 'hold') {
          // On site with no enemy near: plant.
          const site = siteAt(mover.state.position.x, mover.state.position.z);
          if (site) {
            brain.channel = 'plant';
            deps.onChannelStart(actor, 'plant', site);
          }
          return;
        }
        setGoal(siteNode);
        return;
      }
      // Escorts push the same lane, then hold the site edge.
      const siteNode = brain.lane === 0 ? 4 : brain.lane === 2 ? 12 : 8;
      setGoal(siteNode);
      return;
    }
    // Wardens.
    if (planted) {
      const siteNode = state.plant.site === 'A' ? 4 : 12;
      if (brain.goalNode === siteNode && brain.mode === 'hold') {
        const site = siteAt(mover.state.position.x, mover.state.position.z);
        if (site && !state.plant.defusing) {
          brain.channel = 'defuse';
          deps.onChannelStart(actor, 'defuse', site);
        }
        return;
      }
      setGoal(siteNode);
      return;
    }
    // Hold the assigned angle; investigate close gunfire.
    for (const noise of state.noise) {
      if (state.time - noise.at < 1.2 && noise.loud) {
        const dx = noise.x - mover.state.position.x;
        const dz = noise.z - mover.state.position.z;
        if (dx * dx + dz * dz < 30 * 30 && state.time - brain.investigateAt > 6) {
          brain.investigateAt = state.time;
          setGoal(nearestWaypoint(noise.x, noise.z));
          return;
        }
      }
    }
    if (brain.goalNode < 0) setGoal(brain.holdNode ?? 17);
  }

  function roundSetup(round, randomFn) {
    brain.channel = null;
    brain.target = null;
    brain.fallT = 0;
    brain.goalNode = -1;
    brain.pathLen = 0;
    group.rotation.x = 0;
    if (actor.team === TEAM.JACKALS) {
      brain.lane = Math.floor(randomFn() * 3); // 0 A, 1 mid, 2 B
      brain.isCarrier = false;
    } else {
      // Two hold the sites, one mid, one roams.
      const holds = [15, 16, 7, 22];
      brain.holdNode = holds[actor.slot % holds.length];
      brain.holdYaw = waypoint(brain.holdNode).hold ?? Math.PI;
      setGoal(brain.holdNode);
      brain.mode = 'move';
    }
  }

  function buy() {
    const money = actor.money;
    let primary = 'pistol';
    if (money >= 2700 && random() < 0.75) primary = 'rifle';
    else if (money >= 3200 && random() < 0.3) primary = 'dmr';
    else if (money >= 2000 && random() < 0.5) primary = 'shotgun';
    else if (money >= 1500) primary = 'smg';
    else if (money >= 4750 && random() < 0.2) primary = 'sniper';
    actor.loadout.primary = primary;
    actor.weapon = createWeaponState(primary);
    actor.loadout.grenades = { frag: 0, smoke: 0 };
    if (money - WEAPONS[primary].price >= 300 && random() < 0.6) actor.loadout.grenades.frag = 1;
    if (money - WEAPONS[primary].price >= 600 && random() < 0.3) actor.loadout.grenades.smoke = 1;
  }

  const controller = {
    brain, group, step, think, roundSetup, buy, setGoal,
    reset(x, z, yaw) {
      mover.state.position.set(x, 0, z);
      mover.state.velocity.set(0, 0, 0);
      mover.state.yaw = yaw;
      mover.state.pitch = 0;
      group.position.set(x, 0, z);
      group.rotation.set(0, yaw, 0);
      brain.fallT = 0;
      brain.target = null;
      brain.channel = null;
    },
  };
  actor.bot = controller;
  return controller;
}

export function botDisplayName(actor) {
  if (actor.isPlayer) return 'You';
  const names = BOT_NAMES[actor.team];
  return names[actor.slot % names.length];
}
