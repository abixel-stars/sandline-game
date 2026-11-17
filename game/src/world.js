// Yard 9: a desert-industrial yard at dusk, built from boxes, cylinders and canvas
// signs. Three lanes run south (Jackals) to north (Wardens): A lane west, mid, B lane
// east, with a cross connector. Two bomb sites, A west and B east, sit behind the
// Wardens' half. Every solid is a collider for movement and a surface a bullet stops on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import {
  sandTexture, steelTexture, containerTexture, crateTexture, barrelTexture,
  skyTexture, glowTexture, signTexture, repeat,
} from './textures.js';

// Waypoints the bots walk. Edges are listed as pairs of node ids; nav.js runs BFS on them.
export const WAYPOINTS = [
  { id: 0, x: 0, z: 19 },    // Jackals spawn
  { id: 1, x: -14, z: 16 },  // A approach low
  { id: 2, x: -22, z: 10 },  // A approach
  { id: 3, x: -24, z: 0 },   // A mid
  { id: 4, x: -24, z: -13, hold: Math.PI }, // A site
  { id: 5, x: -4, z: 12 },   // mid low
  { id: 6, x: 0, z: 6 },     // mid
  { id: 7, x: 0, z: -2 },    // mid cross
  { id: 8, x: 0, z: -10 },   // mid high
  { id: 9, x: 14, z: 16 },   // B approach low
  { id: 10, x: 22, z: 10 },  // B approach
  { id: 11, x: 24, z: 0 },   // B mid
  { id: 12, x: 24, z: -13, hold: Math.PI }, // B site
  { id: 13, x: -12, z: 0 },  // west connector
  { id: 14, x: 12, z: 0 },   // east connector
  { id: 15, x: -22, z: -8, hold: Math.PI - 0.6 },  // A hold (defenders)
  { id: 16, x: 22, z: -8, hold: Math.PI + 0.6 },  // B hold (defenders)
  { id: 17, x: 0, z: -17, hold: Math.PI },     // Wardens spawn
  { id: 18, x: -8, z: -14 }, // A back
  { id: 19, x: 8, z: -14 },  // B back
  { id: 20, x: -28, z: -16 }, // A corner
  { id: 21, x: 28, z: -16 },  // B corner
  { id: 22, x: -14, z: -4 },  // west mid
  { id: 23, x: 14, z: -4 },   // east mid
];
export const EDGES = [
  [0, 1], [0, 5], [0, 9],
  [1, 2], [2, 3], [3, 4], [3, 13], [4, 15], [4, 20], [4, 18],
  [5, 6], [6, 7], [7, 8], [8, 17], [8, 18], [8, 19],
  [9, 10], [10, 11], [11, 12], [11, 14], [12, 16], [12, 21], [12, 19],
  [13, 22], [13, 3], [14, 23], [14, 11], [22, 7], [23, 7],
  [15, 18], [15, 3], [16, 19], [16, 11], [17, 18], [17, 19],
  [18, 8], [19, 8], [20, 15], [21, 16], [22, 13], [23, 14],
];

export const SITES = [
  { name: 'A', x: -24, z: -14, half: 3.5 },
  { name: 'B', x: 24, z: -14, half: 3.5 },
];
export const SPAWNS = {
  jackals: [{ x: -3, z: 19 }, { x: 0, z: 20 }, { x: 3, z: 19 }, { x: 0, z: 17 }],
  wardens: [{ x: -3, z: -18 }, { x: 0, z: -19 }, { x: 3, z: -18 }, { x: 0, z: -16 }],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'gold' ? 0.5 : 0.92,
      metalness: name === 'steel' || name === 'steelDark' ? 0.55 : 0.04,
    });
  }
  const siteA = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.gold), roughness: 0.6, metalness: 0.1, emissive: new THREE.Color(PALETTE.gold), emissiveIntensity: 0.25 });
  const siteB = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, metalness: 0.1, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.25 });

  // Procedural textures (painted once at load, deterministic). One 256 px tile
  // covers about 4 m, so repeats are sized to each mesh.
  const stdMap = (tex, roughness = 0.9, metalness = 0.05) => new THREE.MeshStandardMaterial({ map: tex, roughness, metalness });
  const sand = sandTexture();
  const steelTex = steelTexture();
  const steelDarkTex = steelTexture('#26292e', '#1a1c20');
  const containerTex = containerTexture();
  const containerDarkTex = containerTexture('#7c3f22', '#5e2f16');
  const crateTex = crateTexture();
  const barrelTex = barrelTexture();
  const sandMat = stdMap(repeat(sand, 8, 6), 1, 0);
  const steelMat = stdMap(steelTex, 0.75, 0.45);
  const steelDarkMat = stdMap(steelDarkTex, 0.8, 0.45);
  const steelLongEW = stdMap(repeat(steelTex, 12, 1), 0.75, 0.45);
  const steelLongNS = stdMap(repeat(steelTex, 16, 1), 0.75, 0.45);
  const containerMat = stdMap(repeat(containerTex, 2, 1), 0.85, 0.15);
  const containerDarkMat = stdMap(repeat(containerDarkTex, 2, 1), 0.85, 0.15);
  // Roof variant without the stencil: the texture shows on the horizontal
  // underside there, where the painted text would read mirrored.
  const containerRoofMat = stdMap(repeat(containerTexture('#7c3f22', '#5e2f16', false), 2, 1), 0.85, 0.15);
  const crateMat = stdMap(crateTex, 0.95, 0);
  const barrelMat = stdMap(barrelTex, 0.8, 0.3);

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    return boxM(w, h, d, x, y, z, materials[material], collide);
  }
  function boxM(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  function cylinder(rTop, rBottom, h, x, y, z, material, segments = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  // Wide (4:1) plate signs. The texture auto-fits the word, so long names like
  // SANDLINE never clip the way the old square sign did.
  function sign(text, w, x, y, z, ry, fg, bg) {
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

  // Ground: one slab with the sand texture, plus worn darker patches.
  boxM(66, 0.4, 46, 0, -0.2, 0, sandMat);
  box(10, 0.06, 8, -14, 0.03, 8, 'sandDark', false);
  box(12, 0.06, 7, 16, 0.03, -6, 'sandDark', false);
  box(8, 0.06, 9, -2, 0.03, -14, 'sandDark', false);

  // Perimeter walls, 4.6 m, open sky above so the low sun reaches the yard.
  boxM(0.6, 4.6, 46.6, -32.3, 2.3, 0, steelLongEW);
  boxM(0.6, 4.6, 46.6, 32.3, 2.3, 0, steelLongEW);
  boxM(65.2, 4.6, 0.6, 0, 2.3, -22.3, steelLongNS);
  boxM(65.2, 4.6, 0.6, 0, 2.3, 22.3, steelLongNS);

  // Dunes outside the walls, a skyline for the screenshots.
  box(30, 6, 8, -40, 1.5, -30, 'sandDark', false);
  box(36, 8, 10, 10, 2, -34, 'sandDark', false);
  box(26, 5, 8, 44, 1, -28, 'sandDark', false);
  box(30, 7, 9, -30, 2, 32, 'sandDark', false);
  box(34, 5, 8, 26, 1.5, 34, 'sandDark', false);

  // --- A lane (west) ---
  boxM(6, 2.6, 1.2, -28.5, 1.3, 8, containerMat);        // container, A approach
  boxM(1.2, 1.1, 1.2, -20, 0.55, 12, crateMat);    // crate
  boxM(1.2, 1.1, 1.2, -27, 0.55, 2, crateMat);     // crate
  boxM(0.5, 3.4, 5, -19.5, 1.7, -3.5, steelMat);      // wall, gap at z 0 for the connector
  boxM(0.5, 3.4, 5, -19.5, 1.7, 3.5, steelMat);
  boxM(3.6, 1.1, 1.2, -20.5, 0.55, -6, crateMat);  // low wall before site A
  boxM(1.2, 2.2, 1.2, -28, 1.1, -10, crateMat);        // tall crate at site A
  boxM(6, 2.6, 1.2, -28, 1.3, -19, containerDarkMat);      // container behind site A
  cylinder(0.55, 0.55, 1.3, -21, 0.65, -12, barrelMat); // barrel

  // --- Mid lane ---
  boxM(1.4, 3.4, 1.4, -6, 1.7, 9, steelMat);         // pillar, mid low
  boxM(1.4, 3.4, 1.4, 3.5, 1.7, 2, steelMat);         // pillar, mid
  boxM(2.4, 1.0, 2.4, -4.5, 0.5, -6, crateMat);    // mid block
  boxM(1.2, 1.1, 1.2, -5, 0.55, -8, crateMat);
  boxM(1.2, 1.1, 1.2, 5, 0.55, -8, crateMat);
  cylinder(0.55, 0.55, 1.3, -2, 0.65, 12, barrelMat);
  cylinder(0.55, 0.55, 1.3, 2.4, 0.65, -12, barrelMat);

  // Watchtower at the mid cross: four legs, a platform you can fight under, a roof.
  for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
    boxM(0.4, 3.6, 0.4, lx, 1.8, lz, steelDarkMat);
  }
  boxM(5.4, 0.3, 5.4, 0, 3.7, 0, steelDarkMat);
  boxM(5.4, 0.25, 5.4, 0, 6.4, 0, containerRoofMat);

  // --- B lane (east), mirrored with different cover ---
  boxM(6, 2.6, 1.2, 28.5, 1.3, 8, containerDarkMat);
  boxM(1.2, 1.1, 1.2, 20, 0.55, 12, crateMat);
  boxM(1.2, 1.1, 1.2, 27, 0.55, 2, crateMat);
  boxM(0.5, 3.4, 5, 19.5, 1.7, -3.5, steelMat);       // wall, gap at z 0 for the connector
  boxM(0.5, 3.4, 5, 19.5, 1.7, 3.5, steelMat);
  boxM(3.6, 1.1, 1.2, 20.5, 0.55, -6, crateMat);
  boxM(1.2, 2.2, 1.2, 28, 1.1, -10, crateMat);
  boxM(6, 2.6, 1.2, 28, 1.3, -19, containerMat);
  cylinder(0.55, 0.55, 1.3, 21, 0.65, -12, barrelMat);

  // --- Connectors and spawn cover ---
  boxM(1.2, 1.1, 3.6, -12, 0.55, 4, crateMat);
  boxM(1.2, 1.1, 3.6, 12, 0.55, 4, crateMat);
  boxM(4, 1.0, 1.2, -8, 0.5, 16, crateMat);
  boxM(4, 1.0, 1.2, 8, 0.5, 16, crateMat);
  boxM(1.2, 1.1, 1.2, -6, 0.55, -16, crateMat);
  boxM(1.2, 1.1, 1.2, 6, 0.55, -16, crateMat);

  // Site plates with a glowing border frame, plus wide "SITE A / SITE B" signs.
  for (const site of SITES) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(site.half * 2, site.half * 2),
      site.name === 'A' ? siteA : siteB,
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(site.x, 0.05, site.z);
    plate.receiveShadow = true;
    group.add(plate);
    const edge = site.name === 'A' ? siteA : siteB;
    const h = site.half;
    boxM(h * 2 + 0.24, 0.03, 0.12, site.x, 0.06, site.z - h - 0.06, edge, false);
    boxM(h * 2 + 0.24, 0.03, 0.12, site.x, 0.06, site.z + h + 0.06, edge, false);
    boxM(0.12, 0.03, h * 2, site.x - h - 0.06, 0.06, site.z, edge, false);
    boxM(0.12, 0.03, h * 2, site.x + h + 0.06, 0.06, site.z, edge, false);
    sign(`SITE ${site.name}`, 3.6, site.x, 3.4, site.z - 3.4, 0, '#241a12', site.name === 'A' ? PALETTE.gold : PALETTE.accent);
  }
  sign('YARD 9', 8, 0, 3.6, 21.9, Math.PI, PALETTE.ink, PALETTE.steelDark);
  // SANDLINE, twice so it reads from spawn: on the west wall clear of the
  // A-approach container's sightline, and on the north wall facing the spawn.
  sign('SANDLINE', 8, -31.9, 3.0, 2, Math.PI / 2, PALETTE.accent, PALETTE.steelDark);
  sign('SANDLINE', 8, -14, 3.2, -21.9, 0, PALETTE.accent, PALETTE.steelDark);

  // Dusk sky: a gradient dome with clouds, plus the low sun as a glow sprite
  // in the same direction as the directional light (west, low).
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(150, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(skyDome);
  const glowTex = glowTexture();
  const sunDir = new THREE.Vector3(-28, 12, 14).normalize();
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color('#ffb45e'), transparent: true, opacity: 0.95,
    fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sunGlow.position.copy(sunDir).multiplyScalar(135);
  sunGlow.scale.setScalar(70);
  scene.add(sunGlow);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color('#fff2cf'), transparent: true, opacity: 1,
    fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sunCore.position.copy(sunDir).multiplyScalar(135);
  sunCore.scale.setScalar(20);
  scene.add(sunCore);

  // Light: a low warm sun from the west, a cool dusk fill, warm sky bounce.
  const sky = new THREE.HemisphereLight(new THREE.Color('#f7c489'), new THREE.Color(PALETTE.sandDark), 0.9);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.6);
  sun.position.set(-28, 12, 14);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d9bb5'), 0.5);
  fill.position.set(20, 10, -16);
  scene.add(fill);
  const siteLightA = new THREE.PointLight(new THREE.Color(PALETTE.gold), 12, 14);
  siteLightA.position.set(-24, 3.5, -14);
  scene.add(siteLightA);
  const siteLightB = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 14);
  siteLightB.position.set(24, 3.5, -14);
  scene.add(siteLightB);

  // Map swaps remove and restore the sky and lights with the geometry:
  // the handles ride on the group so the switcher can find them.
  group.userData.skyBits = { skyDome, sunGlow, sunCore, sky, sun, fill };

  return { colliders, shootables, group, siteLightA, siteLightB };
}

export function siteAt(x, z) {
  for (const site of SITES) {
    if (Math.abs(x - site.x) <= site.half && Math.abs(z - site.z) <= site.half) return site;
  }
  return null;
}
