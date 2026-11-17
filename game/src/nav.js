// Waypoint navigation: a small unweighted graph over world.js WAYPOINTS. BFS gives the
// shortest route; bots repath when their goal changes. No allocation in the hot path:
// the returned path is written into a caller-owned array.
import { WAYPOINTS, EDGES } from './world.js';

const adjacency = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) {
  adjacency[a].push(b);
  adjacency[b].push(a);
}

const cameFrom = new Int16Array(WAYPOINTS.length);
const queue = new Int16Array(WAYPOINTS.length);

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const dx = WAYPOINTS[i].x - x;
    const dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Writes the node ids from `from` to `to` (inclusive) into `out`, returns its length.
export function findPath(from, to, out) {
  if (from === to) {
    out[0] = to;
    return 1;
  }
  cameFrom.fill(-1);
  let head = 0;
  let tail = 0;
  queue[tail] = from;
  tail += 1;
  cameFrom[from] = from;
  while (head < tail) {
    const current = queue[head];
    head += 1;
    for (const next of adjacency[current]) {
      if (cameFrom[next] !== -1) continue;
      cameFrom[next] = current;
      if (next === to) {
        let count = 0;
        let node = to;
        while (node !== from) {
          out[count] = node;
          count += 1;
          node = cameFrom[node];
        }
        out[count] = from;
        count += 1;
        // Reverse in place.
        for (let i = 0, j = count - 1; i < j; i += 1, j -= 1) {
          const tmp = out[i];
          out[i] = out[j];
          out[j] = tmp;
        }
        return count;
      }
      queue[tail] = next;
      tail += 1;
    }
  }
  out[0] = to;
  return 1;
}

export function waypoint(id) {
  return WAYPOINTS[id];
}

// Map swaps rebuild the graph in place: the adjacency lists are refilled
// from the new points and edges. Both maps carry 24 nodes, so the scratch
// tables stay the size they were built with. Callers keep using
// nearestWaypoint / findPath / waypoint.
export function rebuildGraph(points, edges) {
  adjacency.length = 0;
  for (let i = 0; i < points.length; i += 1) adjacency.push([]);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
}
