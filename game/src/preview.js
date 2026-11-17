// The lobby turntable: one agent on a small stage, built from the same
// procedural textures the bots wear in the match, so the preview is the
// agent you actually play as. Its own renderer on the lobby canvas, its own
// slow spin; main.js never sees it. No network, no assets: three.js only.
import * as THREE from 'three';
import {
  uniformTexture,
  helmetTexture,
  skinTexture,
  trouserTexture,
  gunMetalTexture,
  polymerTexture,
} from './textures.js';

// Barrel shape per gun the lobby can show.
const GUN_SHAPE = {
  rifle: { len: 0.8, thick: 0.09, grip: true },
  smg: { len: 0.52, thick: 0.08, grip: true },
  shotgun: { len: 0.84, thick: 0.13, grip: false },
};

// One painted texture per team colour, kept for the showcase's life.
const teamPaint = new Map();
function paintFor(color) {
  let set = teamPaint.get(color);
  if (!set) {
    set = { uniform: uniformTexture(color), helmet: helmetTexture(color) };
    teamPaint.set(color, set);
  }
  return set;
}
let sharedPaint = null;
function shared() {
  if (!sharedPaint) {
    sharedPaint = {
      skin: skinTexture(),
      trousers: trouserTexture(),
      metal: gunMetalTexture(),
      polymer: polymerTexture(),
    };
  }
  return sharedPaint;
}

function box(w, h, d, tex, color) {
  const mat = tex
    ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
    : new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85 });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

// A standing agent, front on, gun held across the chest. Proportions are the
// showcase's own: taller and straighter than the in-match bots, built to be
// looked at rather than shot at.
function buildAgent(agent) {
  const paint = paintFor(agent.color);
  const sharedTex = shared();
  const figure = new THREE.Group();

  const legL = box(0.17, 0.78, 0.2, sharedTex.trousers);
  legL.position.set(-0.11, 0.39, 0);
  const legR = box(0.17, 0.78, 0.2, sharedTex.trousers);
  legR.position.set(0.11, 0.39, 0);
  const bootL = box(0.18, 0.1, 0.3, null, '#17191c');
  bootL.position.set(-0.11, 0.05, 0.04);
  const bootR = box(0.18, 0.1, 0.3, null, '#17191c');
  bootR.position.set(0.11, 0.05, 0.04);
  figure.add(legL, legR, bootL, bootR);

  const torso = box(0.54, 0.74, 0.32, paint.uniform);
  torso.position.set(0, 1.15, 0);
  const stripe = box(0.56, 0.07, 0.34, null, agent.color);
  stripe.position.set(0, 1.34, 0);
  const padL = box(0.2, 0.12, 0.34, paint.uniform);
  padL.position.set(-0.31, 1.5, 0);
  const padR = box(0.2, 0.12, 0.34, paint.uniform);
  padR.position.set(0.31, 1.5, 0);
  figure.add(torso, stripe, padL, padR);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 24, 18),
    new THREE.MeshStandardMaterial({ map: sharedTex.skin, roughness: 0.8 }),
  );
  head.position.set(0, 1.72, 0);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.235, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ map: paint.helmet, roughness: 0.7 }),
  );
  dome.position.set(0, 1.76, 0);
  dome.scale.y = 0.92;
  const visor = box(0.3, 0.07, 0.06, null, '#101214');
  visor.position.set(0, 1.7, 0.19);
  figure.add(head, dome, visor);

  // The gun, held across the chest, barrel pointing up-left.
  const shape = GUN_SHAPE[agent.gun] || GUN_SHAPE.rifle;
  const gun = new THREE.Group();
  const barrel = box(shape.thick, shape.thick, shape.len, sharedTex.metal);
  gun.add(barrel);
  if (shape.grip) {
    const grip = box(0.07, 0.16, 0.09, sharedTex.polymer);
    grip.position.set(0, -0.1, shape.len * 0.18);
    grip.rotation.x = 0.35;
    gun.add(grip);
  }
  const mag = box(0.06, 0.18, 0.08, sharedTex.metal);
  mag.position.set(0, -0.11, -shape.len * 0.05);
  mag.rotation.x = -0.2;
  gun.add(mag);
  gun.position.set(0.05, 1.18, 0.3);
  gun.rotation.set(-0.12, 0.55, -0.5);
  figure.add(gun);

  figure.traverse((part) => {
    if (part.isMesh) part.castShadow = true;
  });
  return figure;
}

export function createShowcase(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#20140d');

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
  camera.position.set(0, 1.5, 3.6);
  camera.lookAt(0, 1.05, 0);

  scene.add(new THREE.AmbientLight('#f5efe4', 0.55));
  const sun = new THREE.DirectionalLight('#ffb066', 1.7);
  sun.position.set(2.5, 4, 2.5);
  sun.castShadow = true;
  scene.add(sun);
  const rim = new THREE.PointLight('#2ec4b6', 12, 8);
  rim.position.set(-2, 2, -1.5);
  scene.add(rim);

  // The low sun, a flat disc behind the agent: dusk without a gradient.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 32),
    new THREE.MeshBasicMaterial({ color: '#f0a830' }),
  );
  disc.position.set(0.7, 1.9, -1.6);
  scene.add(disc);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 40),
    new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  let figure = null;
  let angle = 0.4;
  let spin = false;
  let raf = 0;
  let last = 0;

  function draw() {
    if (figure) {
      figure.rotation.y = angle;
      figure.position.y = Math.sin(angle * 2.2) * 0.02;
    }
    renderer.render(scene, camera);
  }

  function frame(now) {
    if (!spin) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    angle += dt * 0.45;
    draw();
    raf = requestAnimationFrame(frame);
  }

  function size() {
    const w = canvas.clientWidth || 520;
    const h = canvas.clientHeight || 520;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    // Swap the agent on the stage. The old figure's geometry goes; the
    // painted textures are shared per team colour and stay.
    setAgent(agent) {
      if (figure) {
        scene.remove(figure);
        figure.traverse((part) => {
          if (part.isMesh) {
            part.geometry.dispose();
            part.material.dispose();
          }
        });
      }
      figure = buildAgent(agent);
      scene.add(figure);
      angle = 0.4;
      draw();
    },
    start() {
      size();
      if (!spin) {
        spin = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    },
    stop() {
      spin = false;
      cancelAnimationFrame(raf);
    },
    // One still frame at the showcase angle, for deterministic captures.
    paint() {
      size();
      angle = 0.4;
      draw();
    },
  };
}
