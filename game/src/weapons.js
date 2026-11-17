// Weapons: the numbers and the view models. main.js and combat.js own the ray and the
// damage; this module owns fire rate, magazine, reload, spread and recoil per weapon,
// plus the box-built gun the player sees.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { gunMetalTexture, polymerTexture } from './textures.js';

// View-model textures, painted once and shared across weapon swaps.
let vmTex = null;
function viewModelTextures() {
  if (!vmTex) vmTex = { metal: gunMetalTexture(), polymer: polymerTexture() };
  return vmTex;
}

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', short: 'P9', price: 0, slot: 2,
    damage: 26, headMult: 3, mag: 12, reserve: Infinity, auto: false,
    fireGap: 0.18, reloadTime: 1.4, spreadStill: 0.003, spreadMove: 0.02,
    recoil: 0.011, movePenalty: 0.6, range: 60, tracer: PALETTE.gold,
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Dune', short: 'VK-47', price: 2700, slot: 1,
    damage: 34, headMult: 4, mag: 25, reserve: 75, auto: true,
    fireGap: 0.1, reloadTime: 2.0, spreadStill: 0.0022, spreadMove: 0.028,
    recoil: 0.016, movePenalty: 1, range: 90, tracer: PALETTE.gold,
  },
  smg: {
    id: 'smg', name: 'Jackal-9', short: 'JK-9', price: 1500, slot: 1,
    damage: 22, headMult: 3, mag: 32, reserve: 96, auto: true,
    fireGap: 0.075, reloadTime: 1.7, spreadStill: 0.005, spreadMove: 0.03,
    recoil: 0.009, movePenalty: 0.55, range: 45, tracer: PALETTE.accent,
  },
  sniper: {
    id: 'sniper', name: 'Longshot .50', short: 'LS-50', price: 4750, slot: 1,
    damage: 88, headMult: 2, mag: 5, reserve: 15, auto: false,
    fireGap: 1.1, reloadTime: 2.8, spreadStill: 0.0004, spreadMove: 0.09,
    recoil: 0.05, movePenalty: 1.6, range: 120, tracer: PALETTE.accent, scopeFov: 30,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher 12', short: 'BR-12', price: 2000, slot: 1,
    damage: 9, headMult: 2, mag: 6, reserve: 24, auto: false, pellets: 8,
    fireGap: 0.9, reloadTime: 2.4, spreadStill: 0.02, spreadMove: 0.045,
    recoil: 0.035, movePenalty: 0.9, range: 28, tracer: PALETTE.danger,
  },
  dmr: {
    id: 'dmr', name: 'Kestrel-7', short: 'KS-7', price: 3200, slot: 1,
    damage: 52, headMult: 3, mag: 10, reserve: 30, auto: false,
    fireGap: 0.5, reloadTime: 2.2, spreadStill: 0.001, spreadMove: 0.06,
    recoil: 0.03, movePenalty: 1.2, range: 110, tracer: PALETTE.accent, scopeFov: 40,
  },
  twin: {
    id: 'twin', name: 'Twin-12', short: 'TW-12', price: 2400, slot: 1,
    damage: 8, headMult: 2, mag: 2, reserve: 16, auto: false, pellets: 12,
    fireGap: 1.6, reloadTime: 2.8, spreadStill: 0.026, spreadMove: 0.05,
    recoil: 0.05, movePenalty: 0.8, range: 22, tracer: PALETTE.danger,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Spark Frag', price: 300, radius: 6, maxDamage: 120, fuse: 1.6 },
  smoke: { id: 'smoke', name: 'Haze Smoke', price: 300, radius: 4, duration: 12 },
};

export const BUY_MENU = [
  { key: '1', id: 'rifle', label: 'VK-47 Dune — rifle' },
  { key: '2', id: 'smg', label: 'Jackal-9 — SMG' },
  { key: '3', id: 'sniper', label: 'Longshot .50 — sniper' },
  { key: '4', id: 'shotgun', label: 'Breacher 12 — shotgun' },
  { key: '5', id: 'frag', label: 'Spark Frag — grenade' },
  { key: '6', id: 'smoke', label: 'Haze Smoke — grenade' },
  { key: '7', id: 'dmr', label: 'Kestrel-7 — marksman rifle' },
  { key: '8', id: 'twin', label: 'Twin-12 — double scattergun' },
];

// One weapon instance: ammo and timers for one actor.
export function createWeaponState(weaponId) {
  const def = WEAPONS[weaponId];
  return {
    def,
    mag: def.mag,
    reserve: def.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
  };
}

export function weaponReady(state) {
  return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
}

export function weaponSpread(def, speed, crouching) {
  const move = Math.min(1, speed / 5.2) * def.spreadMove * def.movePenalty;
  const still = crouching ? def.spreadStill * 0.6 : def.spreadStill;
  return still + move;
}

export function weaponStep(state, dt) {
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.flash = Math.max(0, state.flash - dt);
  state.kick += (0 - state.kick) * Math.min(1, dt * 14);
  if (state.reloadLeft > 0) {
    state.reloadLeft = Math.max(0, state.reloadLeft - dt);
    if (state.reloadLeft === 0) {
      const need = state.def.mag - state.mag;
      const take = Math.min(need, state.reserve);
      state.mag += take;
      state.reserve -= take;
    }
  }
}

export function weaponReload(state) {
  const def = state.def;
  if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false;
  state.reloadLeft = def.reloadTime;
  return true;
}

export function weaponFire(state) {
  if (state.mag <= 0) return false;
  state.mag -= 1;
  state.cooldown = state.def.fireGap;
  state.flash = 0.06;
  state.kick = 0.055;
  return true;
}

// The view model: a small box-built gun parented to the camera. Rebuilt per weapon,
// so switching weapons swaps the model.
export function createViewModel(camera, weaponId) {
  const def = WEAPONS[weaponId];
  const tex = viewModelTextures();
  const grip = new THREE.MeshStandardMaterial({ map: tex.polymer, roughness: 0.75, metalness: 0.1 });
  const body = new THREE.MeshStandardMaterial({ map: tex.metal, roughness: 0.45, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

  const model = new THREE.Group();
  const barrelLength = weaponId === 'sniper' ? 0.62 : weaponId === 'shotgun' ? 0.5 : weaponId === 'smg' ? 0.3 : weaponId === 'pistol' ? 0.2 : 0.42;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, barrelLength), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, barrelLength * 0.8), grip);
  barrel.position.set(0, 0.025, -barrelLength * 0.75);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
  stock.position.set(0, -0.02, barrelLength * 0.5);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.012, barrelLength * 0.35), accent);
  stripe.position.set(0, 0.055, -barrelLength * 0.15);
  model.add(receiver, barrel, stock, stripe);
  if (weaponId === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), grip);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, -0.05);
    model.add(scope);
  }
  if (weaponId === 'shotgun') {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.2), grip);
    pump.position.set(0, -0.04, -0.28);
    model.add(pump);
  }
  if (weaponId === 'dmr') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), grip);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.085, -0.02);
    model.add(scope);
    const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.16), grip);
    bipod.position.set(0, -0.05, -0.3);
    model.add(bipod);
  }
  if (weaponId === 'twin') {
    const second = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, barrelLength * 0.8), grip);
    second.position.set(0.055, 0.025, -barrelLength * 0.75);
    model.add(second);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.06), accent);
    band.position.set(0.027, 0.03, -barrelLength * 0.6);
    model.add(band);
  }
  model.scale.setScalar(0.8);
  model.position.set(0.26, -0.22, -0.45);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.gold), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  return {
    model,
    step(state, dt) {
      model.position.z = -0.45 + state.kick;
      model.rotation.x = state.kick * 2.2;
      if (state.reloadLeft > 0) {
        model.rotation.x = -0.55 * Math.min(1, (state.def.reloadTime - state.reloadLeft) * 2);
      }
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
    },
    dispose() {
      camera.remove(model, flash, flashLight);
      for (const mesh of [model, flash]) mesh.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });
    },
  };
}
