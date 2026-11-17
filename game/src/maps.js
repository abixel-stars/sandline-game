// Map switching: Yard 9 (dusk) and Yard 10 (night) share one scene, one
// collider list and one nav graph, so a switch swaps the contents in place
// instead of rebuilding the game. The bot brain, the player mover and the
// combat raycaster all read the same arrays, so they follow the swap with
// no changes of their own. Yard 9's data is snapshotted here at load time,
// before anything mutates it.
import * as THREE from 'three';
import { WAYPOINTS, EDGES, SITES, SPAWNS } from './world.js';
import { Y10_WAYPOINTS, Y10_EDGES, Y10_SITES, Y10_SPAWNS, buildNightYard } from './yard10.js';
import { rebuildGraph } from './nav.js';
import { combatHooks } from './combat.js';

export const MAPS = {
  yard9: { id: 'yard9', name: 'Yard 9', tag: 'DUSK' },
  yard10: { id: 'yard10', name: 'Yard 10', tag: 'NIGHT' },
};

const DAY_POINTS = WAYPOINTS.map((p) => ({ ...p }));
const DAY_EDGES = EDGES.map((e) => [e[0], e[1]]);
const DAY_SITES = SITES.map((s) => ({ ...s }));
const DAY_SPAWNS = {
  jackals: SPAWNS.jackals.map((s) => ({ ...s })),
  wardens: SPAWNS.wardens.map((s) => ({ ...s })),
};
const DAY_SKY = '#e08a4c';
const NIGHT_SKY = '#0b1026';

function swapList(list, items) {
  list.length = 0;
  for (const item of items) list.push(item);
}
function swapPoints(list, items) {
  list.length = 0;
  for (const item of items) list.push({ ...item });
}
function swapEdges(list, items) {
  list.length = 0;
  for (const item of items) list.push([item[0], item[1]]);
}
function swapSpawns(spawns, items) {
  swapPoints(spawns.jackals, items.jackals);
  swapPoints(spawns.wardens, items.wardens);
}

export function createMapSwitch(scene, world) {
  let current = 'yard9';
  let night = null;
  let savedDay = null;

  function dropSkyBits(bits) {
    if (!bits) return;
    for (const key of Object.keys(bits)) {
      const value = bits[key];
      if (Array.isArray(value)) {
        for (const light of value) scene.remove(light);
      } else if (value) {
        scene.remove(value);
      }
    }
  }
  function addSkyBits(bits) {
    if (!bits) return;
    for (const key of Object.keys(bits)) {
      const value = bits[key];
      if (Array.isArray(value)) {
        for (const light of value) scene.add(light);
      } else if (value) {
        scene.add(value);
      }
    }
  }

  function switchTo(id) {
    if (id === current) return;
    if (id === 'yard10') {
      savedDay = { colliders: [...world.colliders], shootables: [...world.shootables] };
      scene.remove(world.group);
      dropSkyBits(world.group.userData.skyBits);
      if (!night) night = buildNightYard(scene);
      else {
        scene.add(night.group);
        addSkyBits(night.skyBits);
      }
      swapList(world.colliders, night.colliders);
      swapList(world.shootables, night.shootables);
      swapPoints(WAYPOINTS, Y10_WAYPOINTS);
      swapEdges(EDGES, Y10_EDGES);
      swapPoints(SITES, Y10_SITES);
      swapSpawns(SPAWNS, Y10_SPAWNS);
      rebuildGraph(Y10_WAYPOINTS, Y10_EDGES);
      scene.background = new THREE.Color(NIGHT_SKY);
      scene.fog.color.set(NIGHT_SKY);
      scene.fog.near = 24;
      scene.fog.far = 82;
      current = 'yard10';
    } else {
      scene.remove(night.group);
      dropSkyBits(night.skyBits);
      scene.add(world.group);
      addSkyBits(world.group.userData.skyBits);
      swapList(world.colliders, savedDay.colliders);
      swapList(world.shootables, savedDay.shootables);
      swapPoints(WAYPOINTS, DAY_POINTS);
      swapEdges(EDGES, DAY_EDGES);
      swapPoints(SITES, DAY_SITES);
      swapSpawns(SPAWNS, DAY_SPAWNS);
      rebuildGraph(DAY_POINTS, DAY_EDGES);
      scene.background = new THREE.Color(DAY_SKY);
      scene.fog.color.set(DAY_SKY);
      scene.fog.near = 30;
      scene.fog.far = 95;
      current = 'yard9';
    }
    if (combatHooks.onMapSwap) combatHooks.onMapSwap();
  }

  return {
    get current() {
      return current;
    },
    switchTo,
  };
}
