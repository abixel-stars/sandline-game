// Yard 10 — Night Yard. A night version of the desert-industrial yard with its
// own layout: a central warehouse hall with one corridor through it, floodlit
// corners, a crate maze west and barrel rows east. Same node roles as Yard 9
// (0 Jackals spawn, 4 site A, 12 site B, 17 Wardens spawn, 15/16 site holds,
// 7 mid cross, 8 mid high) so the bot brain runs on both maps unchanged,
// but every coordinate, edge and piece of cover is this map's own.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import {
  sandTexture, steelTexture, containerTexture, crateTexture, barrelTexture,
  glowTexture, signTexture, repeat,
} from './textures.js';
import { mulberry32 } from './rng.js';

export const Y10_WAYPOINTS = [
  { id: 0, x: 0, z: 19 },
  { id: 1, x: -15, z: 15 },
  { id: 2, x: -24, z: 9 },
  { id: 3, x: -25, z: -3 },
  { id: 4, x: -24, z: -14, hold: Math.PI },
  { id: 5, x: -4, z: 13 },
  { id: 6, x: 0, z: 1 },
  { id: 7, x: 0, z: -5 },
  { id: 8, x: 0, z: -11 },
  { id: 9, x: 15, z: 15 },
  { id: 10, x: 24, z: 9 },
  { id: 11, x: 25, z: -3 },
  { id: 12, x: 24, z: -14, hold: Math.PI },
  { id: 13, x: -13, z: -6 },
  { id: 14, x: 13, z: -6 },
  { id: 15, x: -20, z: -9, hold: Math.PI - 0.6 },
  { id: 16, x: 20, z: -9, hold: Math.PI + 0.6 },
  { id: 17, x: 0, z: -18, hold: Math.PI },
  { id: 18, x: -11, z: -15 },
  { id: 19, x: 11, z: -15 },
  { id: 20, x: -29, z: -17 },
  { id: 21, x: 29, z: -17 },
  { id: 22, x: -13, z: -10 },
  { id: 23, x: 13, z: -10 },
];
export const Y10_EDGES = [
  [0, 1], [0, 5], [0, 9],
  [1, 2], [2, 3], [3, 4], [3, 13], [4, 15], [4, 20], [4, 18],
  [5, 6], [6, 7], [7, 8], [8, 17], [8, 18], [8, 19],
  [9, 10], [10, 11], [11, 12], [11, 14], [12, 16], [12, 21], [12, 19],
  [13, 22], [13, 3], [14, 23], [14, 11], [22, 7], [23, 7],
  [15, 18], [15, 3], [16, 19], [16, 11], [17, 18], [17, 19],
  [18, 8], [19, 8], [20, 15], [21, 16], [22, 13], [23, 14],
];
export const Y10_SITES = [
  { name: 'A', x: -24, z: -15, half: 3.5 },
  { name: 'B', x: 24, z: -15, half: 3.5 },
];
export const Y10_SPAWNS = {
  jackals: [{ x: -4, z: 19 }, { x: 0, z: 18 }, { x: 4, z: 19 }, { x: -1, z: 16 }],
  wardens: [{ x: -4, z: -18 }, { x: 0, z: -19 }, { x: 4, z: -18 }, { x: 1, z: -16 }],
};

// Night sky, painted once from a fixed seed: flat navy bands, scattered
// stars and one moon. No gradient fills; the bands step down the dome.
export function nightSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const rng = mulberry32(1010);
  const bands = ['#141d42', '#16204a', '#1a2454', '#121a3c', '#0a1028'];
  for (let i = 0; i < 5; i += 1) {
    g.fillStyle = bands[i];
    g.fillRect(0, i * 103, 1024, 103);
  }
  for (let i = 0; i < 260; i += 1) {
    const y = rng() * 300;
    const bright = rng();
    g.globalAlpha = 0.35 + bright * 0.65;
    g.fillStyle = bright > 0.85 ? '#cfe4ff' : '#f5efe4';
    const r = bright > 0.9 ? 1.8 : 0.9;
    g.beginPath();
    g.arc(rng() * 1024, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#f2ecd8';
  g.beginPath();
  g.arc(760, 92, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d9d2b8';
  g.beginPath();
  g.arc(752, 86, 5, 0, Math.PI * 2);
  g.arc(770, 100, 7, 0, Math.PI * 2);
  g.arc(758, 104, 3.5, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildNightYard(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];
  const sand = sandTexture();
  const steelTex = steelTexture();
  const steelDarkTex = steelTexture('#23262b', '#16181c');
  const containerTex = containerTexture();
  const containerDarkTex = containerTexture('#6e3a1e', '#522a14');
  const crateTex = crateTexture();
  const barrelTex = barrelTexture();
  // Night tints: the same painted tiles, multiplied down so the yard reads dark.
  const night = (tex, tint, rough = 0.9, metal = 0.05) => new THREE.MeshStandardMaterial({
    map: tex, color: new THREE.Color(tint), roughness: rough, metalness: metal,
  });
  const sandMat = night(repeat(sand, 8, 6), '#b59a78', 1, 0);
  const steelMat = night(steelTex, '#c2c7cd', 0.75, 0.45);
  const steelDarkMat = night(steelDarkTex, '#c9ced4', 0.8, 0.45);
  const steelLongEW = night(repeat(steelTex, 12, 1), '#c2c7cd', 0.75, 0.45);
  const steelLongNS = night(repeat(steelTex, 16, 1), '#c2c7cd', 0.75, 0.45);
  const containerMat = night(repeat(containerTex, 2, 1), '#cfae8d', 0.85, 0.15);
  const containerDarkMat = night(repeat(containerDarkTex, 2, 1), '#cfae8d', 0.85, 0.15);
  const crateMat = night(crateTex, '#d6c2a2', 0.95, 0);
  const barrelMat = night(barrelTex, '#cfae8d', 0.8, 0.3);
  const poolMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c9a86a'), transparent: true, opacity: 0.22 });
  const lampMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#fff2cf'), emissive: new THREE.Color('#ffdf9e'), emissiveIntensity: 2.2 });

  function put(w, h, d, x, y, z, mat, collide = true, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  function tube(r, h, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  function plate(text, w, x, y, z, ry, fg, bg) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshStandardMaterial({ map: signTexture(text, fg, bg), roughness: 0.85 }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    group.add(mesh);
    shootables.push(mesh);
    return mesh;
  }
  function pool(x, z, r) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 24), poolMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, 0.04, z);
    group.add(disc);
    return disc;
  }

  // Ground slab, darker worn patches, perimeter walls.
  put(66, 0.4, 46, 0, -0.2, 0, sandMat);
  put(10, 0.06, 8, -15, 0.03, 9, night(repeat(sand, 2, 2), '#8a755a', 1, 0), false);
  put(12, 0.06, 7, 15, 0.03, -8, night(repeat(sand, 2, 2), '#8a755a', 1, 0), false);
  put(0.6, 4.6, 46.6, -32.3, 2.3, 0, steelLongEW);
  put(0.6, 4.6, 46.6, 32.3, 2.3, 0, steelLongEW);
  put(65.2, 4.6, 0.6, 0, 2.3, -22.3, steelLongNS);
  put(65.2, 4.6, 0.6, 0, 2.3, 22.3, steelLongNS);

  // Dunes outside, barely visible at night.
  put(30, 6, 8, -40, 1.5, -30, night(repeat(sand, 4, 1), '#75634a', 1, 0), false);
  put(36, 8, 10, 10, 2, -34, night(repeat(sand, 4, 1), '#75634a', 1, 0), false);
  put(30, 7, 9, -30, 2, 32, night(repeat(sand, 4, 1), '#75634a', 1, 0), false);
  put(34, 5, 8, 26, 1.5, 34, night(repeat(sand, 4, 1), '#75634a', 1, 0), false);

  // --- Central warehouse: two halls with one lit corridor between them ---
  put(8.5, 5, 12, -5.75, 2.5, -3, steelDarkMat);
  put(8.5, 5, 12, 5.75, 2.5, -3, steelDarkMat);
  put(9.1, 0.35, 12.6, -5.75, 5.15, -3, containerDarkMat);
  put(9.1, 0.35, 12.6, 5.75, 5.15, -3, containerDarkMat);
  put(1.2, 1.1, 1.2, -1.9, 0.55, 3.4, crateMat);
  put(1.2, 1.1, 1.2, 1.9, 0.55, -7.4, crateMat);
  put(3.4, 0.3, 1.0, 0, 3.4, 1.6, steelMat); // lintel over the south mouth
  put(3.4, 0.3, 1.0, 0, 3.4, -7.6, steelMat); // lintel over the north mouth
  plate('NIGHT YARD', 7, 0, 4.2, 3.15, Math.PI, PALETTE.ink, PALETTE.steelDark);

  // --- West yard: a crate maze and a stacked container pair ---
  put(6, 2.6, 1.2, -28.5, 1.3, 6, containerMat);
  put(6, 2.6, 1.2, -28.5, 3.9, 6, containerDarkMat);
  put(1.2, 1.1, 1.2, -20, 0.55, 12, crateMat);
  put(1.2, 1.1, 1.2, -18.8, 0.55, 12, crateMat);
  put(1.2, 1.1, 3.6, -16, 0.55, 8, crateMat);
  put(1.2, 2.2, 1.2, -22, 1.1, 2, crateMat);
  put(3.6, 1.1, 1.2, -21, 0.55, -6, crateMat);
  put(1.2, 2.2, 1.2, -28, 1.1, -11, crateMat);
  put(6, 2.6, 1.2, -28, 1.3, -19, containerDarkMat);
  tube(0.55, 1.3, -21, 0.65, -12, barrelMat);

  // --- East yard: barrel rows and one angled container ---
  put(6, 2.6, 1.2, 28.5, 1.3, 8, containerDarkMat, true, 0.35);
  put(1.2, 1.1, 1.2, 20, 0.55, 12, crateMat);
  put(1.2, 1.1, 1.2, 27, 0.55, 2, crateMat);
  put(0.5, 3.4, 5, 19.5, 1.7, -3.5, steelMat);
  put(0.5, 3.4, 5, 19.5, 1.7, 3.5, steelMat);
  put(3.6, 1.1, 1.2, 20.5, 0.55, -6, crateMat);
  put(1.2, 2.2, 1.2, 28, 1.1, -10, crateMat);
  put(6, 2.6, 1.2, 28, 1.3, -19, containerMat);
  tube(0.55, 1.3, 21, 0.65, -12, barrelMat);
  tube(0.55, 1.3, 22.4, 0.65, -10.6, barrelMat);
  tube(0.55, 1.3, 19.6, 0.65, -10.6, barrelMat);

  // --- South cover and site walls ---
  put(1.2, 1.1, 3.6, -12, 0.55, 4, crateMat);
  put(1.2, 1.1, 3.6, 12, 0.55, 4, crateMat);
  put(4, 1.0, 1.2, -8, 0.5, 16, crateMat);
  put(4, 1.0, 1.2, 8, 0.5, 16, crateMat);
  put(1.2, 1.1, 1.2, -6, 0.55, -16, crateMat);
  put(1.2, 1.1, 1.2, 6, 0.55, -16, crateMat);
  put(0.5, 3.4, 6, -19.5, 1.7, -9, steelMat);
  put(0.5, 3.4, 6, 19.5, 1.7, -9, steelMat);

  // Site plates with glowing borders, plus SITE A / SITE B signs.
  const siteA = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.gold), roughness: 0.6, metalness: 0.1, emissive: new THREE.Color(PALETTE.gold), emissiveIntensity: 0.35 });
  const siteB = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, metalness: 0.1, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35 });
  for (const site of Y10_SITES) {
    const mat = site.name === 'A' ? siteA : siteB;
    const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(site.half * 2, site.half * 2), mat);
    plateMesh.rotation.x = -Math.PI / 2;
    plateMesh.position.set(site.x, 0.05, site.z);
    plateMesh.receiveShadow = true;
    group.add(plateMesh);
    const h = site.half;
    put(h * 2 + 0.24, 0.03, 0.12, site.x, 0.06, site.z - h - 0.06, mat, false);
    put(h * 2 + 0.24, 0.03, 0.12, site.x, 0.06, site.z + h + 0.06, mat, false);
    put(0.12, 0.03, h * 2, site.x - h - 0.06, 0.06, site.z, mat, false);
    put(0.12, 0.03, h * 2, site.x + h + 0.06, 0.06, site.z, mat, false);
    plate(`SITE ${site.name}`, 3.6, site.x, 3.4, site.z - 3.4, 0, '#241a12', site.name === 'A' ? PALETTE.gold : PALETTE.accent);
  }
  plate('YARD 10', 8, 0, 3.6, 21.9, Math.PI, PALETTE.ink, PALETTE.steelDark);
  plate('SANDLINE', 8, -31.9, 3.0, 2, Math.PI / 2, PALETTE.accent, PALETTE.steelDark);

  // Floodlight towers at the four inner corners: poles, lamp heads, pools.
  const floods = [];
  for (const [fx, fz] of [[-28, 14], [28, 14], [-28, -16], [28, -16]]) {
    tube(0.18, 6.4, fx, 3.2, fz, steelDarkMat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), lampMat);
    head.position.set(fx, 6.5, fz);
    head.rotation.x = 0.5;
    group.add(head);
    shootables.push(head);
    const light = new THREE.PointLight(new THREE.Color('#ffd9a0'), 60, 34);
    light.position.set(fx, 6.2, fz);
    scene.add(light);
    floods.push(light);
    pool(fx * 0.82, fz * 0.82, 6.5);
  }

  // Night sky: a star dome, a moon glow and a moon core high in the east.
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(150, 32, 16),
    new THREE.MeshBasicMaterial({ map: nightSkyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(skyDome);
  const glowTex = glowTexture();
  const moonDir = new THREE.Vector3(60, 55, -40).normalize();
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color('#bcd0ff'), transparent: true, opacity: 0.55,
    fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  moonGlow.position.copy(moonDir).multiplyScalar(135);
  moonGlow.scale.setScalar(46);
  scene.add(moonGlow);
  const moonCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color('#f2ecd8'), transparent: true, opacity: 1,
    fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  moonCore.position.copy(moonDir).multiplyScalar(135);
  moonCore.scale.setScalar(13);
  scene.add(moonCore);

  // Light: a cool moon from the east, a dim blue night fill, warm site lights.
  const hemi = new THREE.HemisphereLight(new THREE.Color('#33406e'), new THREE.Color('#1a1410'), 1.4);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(new THREE.Color('#aebfe8'), 2.2);
  moon.position.set(60, 55, -40);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -38;
  moon.shadow.camera.right = 38;
  moon.shadow.camera.top = 30;
  moon.shadow.camera.bottom = -30;
  moon.shadow.camera.far = 140;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6f9e'), 0.8);
  fill.position.set(-20, 12, 20);
  scene.add(fill);
  const siteLightA = new THREE.PointLight(new THREE.Color(PALETTE.gold), 30, 14);
  siteLightA.position.set(-24, 3.5, -15);
  scene.add(siteLightA);
  const siteLightB = new THREE.PointLight(new THREE.Color(PALETTE.accent), 30, 14);
  siteLightB.position.set(24, 3.5, -15);
  scene.add(siteLightB);

  return {
    group, colliders, shootables, siteLightA, siteLightB,
    skyBits: { skyDome, moonGlow, moonCore, hemi, moon, fill, floods },
  };
}
