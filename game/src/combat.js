// Combat: hitscan shooting, tracers, grenades and smoke. It owns the raycaster and the
// pools; main.js and bot.js ask it to fire, and it answers with what was hit.
// No allocation in the hot path: one raycaster, one direction vector, pooled tracers.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { GRENADES } from './weapons.js';

const TRACER_POOL = 16;
const SMOKE_SPHERES = 9;

// Hooks other modules set: onDamage reports every hit for the stats screen,
// onMapSwap rebuilds the shootable cache after a map switch.
export const combatHooks = { onDamage: null, onMapSwap: null };

export function createCombat(scene, world, state, audio, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 140;
  // A map swap replaces world.shootables; the cached target list is rebuilt
  // on the next shot instead of keeping the old map's meshes.
  combatHooks.onMapSwap = () => { targets = null; targetsCount = -1; };
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  const tmpBox = new THREE.Box3();

  // Tracer pool: thin additive boxes, stretched between muzzle and hit.
  const tracers = [];
  const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const mesh = new THREE.Mesh(
      tracerGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  const actorMeshes = []; // hit meshes (torso/head) of every actor
  let targets = null; // shootables + actor meshes, rebuilt only when actors register
  let targetsCount = -1;
  const grenades = [];
  const smokes = []; // { x, y, z, r, until, group }
  const smokeGeo = new THREE.SphereGeometry(1, 10, 8);
  const smokeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#b9b2a4'), transparent: true, opacity: 0.5, depthWrite: false });

  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.5, metalness: 0.6 });

  function showTracer(from, to, color) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_POOL;
    const length = from.distanceTo(to);
    tracer.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    tracer.mesh.lookAt(to);
    tracer.mesh.scale.set(1, 1, Math.max(0.1, length));
    tracer.mesh.material.color.set(color);
    tracer.mesh.material.opacity = 0.85;
    tracer.mesh.visible = true;
    tracer.life = 0.09;
  }

  function hasLOS(from, to) {
    direction.copy(to).sub(from);
    const distance = direction.length();
    if (distance < 0.001) return true;
    direction.multiplyScalar(1 / distance);
    raycaster.set(from, direction);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    if (hit) return false;
    for (const smoke of smokes) {
      if (segmentHitsSphere(from, to, smoke.x, smoke.y, smoke.z, smoke.r)) return false;
    }
    return true;
  }

  function segmentHitsSphere(a, b, cx, cy, cz, r) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const acx = cx - a.x;
    const acy = cy - a.y;
    const acz = cz - a.z;
    const lenSq = abx * abx + aby * aby + abz * abz;
    let t = lenSq === 0 ? 0 : (acx * abx + acy * aby + acz * abz) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = a.x + abx * t - cx;
    const dy = a.y + aby * t - cy;
    const dz = a.z + abz * t - cz;
    return dx * dx + dy * dy + dz * dz < r * r;
  }

  function registerActor(hitMeshes) {
    for (const mesh of hitMeshes) actorMeshes.push(mesh);
  }

  // Fires one hitscan pellet from `from` along `dir` with angular `spread` (radians).
  // Returns { hit, actor, part, point, distance } or { hit: false, point }.
  function fireHitscan(from, dir, spread, random, range) {
    direction.copy(dir);
    if (spread > 0) {
      direction.x += (random() * 2 - 1) * spread;
      direction.y += (random() * 2 - 1) * spread;
      direction.z += (random() * 2 - 1) * spread;
      direction.normalize();
    }
    raycaster.set(from, direction);
    raycaster.far = range;
    if (targetsCount !== actorMeshes.length) {
      targets = world.shootables.concat(actorMeshes);
      targetsCount = actorMeshes.length;
    }
    const hits = raycaster.intersectObjects(targets, false);
    const hit = hits[0];
    if (!hit) {
      hitPoint.copy(from).addScaledVector(direction, range);
      return { hit: false, point: hitPoint };
    }
    hitPoint.copy(hit.point);
    const data = hit.object.userData;
    if (data.actor) {
      return { hit: true, actor: data.actor, part: data.part, point: hitPoint, distance: hit.distance };
    }
    return { hit: true, actor: null, part: null, point: hitPoint, distance: hit.distance };
  }

  function damageActor(shooter, target, amount, part, onKill, onHit) {
    if (!target.alive) return false;
    target.health -= amount;
    if (combatHooks.onDamage) combatHooks.onDamage(shooter, target);
    if (onHit) onHit(target, part === 'head');
    if (target.health > 0) return false;
    target.health = 0;
    target.alive = false;
    if (onKill) onKill(shooter, target, part === 'head');
    return true;
  }

  function throwGrenade(kind, from, dir, owner) {
    const def = GRENADES[kind];
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.position.copy(from);
    scene.add(mesh);
    grenades.push({
      kind, owner, mesh,
      vx: dir.x * 15, vy: dir.y * 15 + 2.5, vz: dir.z * 15,
      fuse: kind === 'frag' ? def.fuse : 0.9,
      bounced: 0,
    });
    return true;
  }

  function explodeGrenade(grenade, onKill, onHit) {
    const def = GRENADES.frag;
    const pos = grenade.mesh.position;
    audio.explosion();
    for (const actor of state.actors) {
      if (!actor.alive || actor === grenade.owner) continue;
      const dx = actor.pos.x - pos.x;
      const dy = (actor.pos.y + 1.1) - pos.y;
      const dz = actor.pos.z - pos.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > def.radius) continue;
      toTarget.set(actor.pos.x, actor.pos.y + 1.1, actor.pos.z);
      origin.copy(pos);
      const blocked = !hasLOS(origin, toTarget);
      let amount = def.maxDamage * (1 - distance / def.radius) + 20;
      if (blocked) amount *= 0.25;
      damageActor(grenade.owner, actor, Math.round(amount), 'torso', onKill, onHit);
    }
    scene.remove(grenade.mesh);
  }

  function spawnSmoke(pos) {
    const group = new THREE.Group();
    const spheres = [];
    for (let i = 0; i < SMOKE_SPHERES; i += 1) {
      const mesh = new THREE.Mesh(smokeGeo, smokeMat.clone());
      mesh.position.set((random() - 0.5) * 3, 0.8 + random() * 1.6, (random() - 0.5) * 3);
      mesh.scale.setScalar(1.1 + random() * 0.7);
      group.add(mesh);
      spheres.push(mesh);
    }
    group.position.copy(pos);
    scene.add(group);
    smokes.push({ x: pos.x, y: 1.2, z: pos.z, r: 3.4, until: state.time + GRENADES.smoke.duration, group, spheres });
    audio.smoke();
  }

  function step(dt, onKill, onHit) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.mesh.material.opacity = Math.max(0, tracer.life / 0.09) * 0.85;
      if (tracer.life <= 0) tracer.mesh.visible = false;
    }
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vy -= 14 * dt;
      const mesh = g.mesh;
      let nx = mesh.position.x + g.vx * dt;
      let ny = mesh.position.y + g.vy * dt;
      let nz = mesh.position.z + g.vz * dt;
      tmpBox.min.set(nx - 0.09, ny - 0.09, nz - 0.09);
      tmpBox.max.set(nx + 0.09, ny + 0.09, nz + 0.09);
      let blocked = false;
      for (const c of world.colliders) {
        if (tmpBox.intersectsBox(c)) { blocked = true; break; }
      }
      if (blocked) {
        // Simple bounce: reverse the dominant axis, damp the rest.
        if (Math.abs(g.vx) > Math.abs(g.vz) && Math.abs(g.vx) > Math.abs(g.vy)) g.vx *= -0.45;
        else if (Math.abs(g.vz) > Math.abs(g.vy)) g.vz *= -0.45;
        else g.vy = Math.abs(g.vy) * 0.45;
        g.vx *= 0.7;
        g.vz *= 0.7;
        g.bounced += 1;
        if (g.bounced === 1) audio.bounce();
        nx = mesh.position.x;
        ny = mesh.position.y;
        nz = mesh.position.z;
      }
      if (ny < 0.09) {
        ny = 0.09;
        g.vy = Math.abs(g.vy) * 0.45;
        g.vx *= 0.7;
        g.vz *= 0.7;
      }
      mesh.position.set(nx, ny, nz);
      if (g.fuse <= 0) {
        if (g.kind === 'frag') explodeGrenade(g, onKill, onHit);
        else spawnSmoke(mesh.position);
        scene.remove(mesh);
        grenades.splice(i, 1);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const smoke = smokes[i];
      const left = smoke.until - state.time;
      if (left <= 0) {
        scene.remove(smoke.group);
        smokes.splice(i, 1);
        continue;
      }
      const opacity = left < 2 ? 0.5 * (left / 2) : 0.5;
      for (const sphere of smoke.spheres) sphere.material.opacity = opacity;
    }
  }

  return { registerActor, fireHitscan, damageActor, throwGrenade, hasLOS, showTracer, step, grenades, smokes };
}
