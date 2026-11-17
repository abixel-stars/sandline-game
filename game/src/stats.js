// Per-player shooting stats: shots, hits and assists, for the results screen.
// main.js and bot.js report shots and hits; combat.js reports damage through
// the hook, so an assist is a kill by someone else shortly after your damage.
export function createStats(state) {
  const rows = new Map();
  function row(actor) {
    let r = rows.get(actor.id);
    if (!r) {
      r = { shots: 0, hits: 0, assists: 0, lastBy: null, lastAt: -99 };
      rows.set(actor.id, r);
    }
    return r;
  }
  return {
    shot(actor, hit) {
      const r = row(actor);
      r.shots += 1;
      if (hit) r.hits += 1;
    },
    damaged(shooter, target) {
      if (!shooter || shooter === target) return;
      const r = row(target);
      r.lastBy = shooter;
      r.lastAt = state.time;
    },
    killed(killer, victim) {
      const r = row(victim);
      if (r.lastBy && r.lastBy !== killer && state.time - r.lastAt <= 5) {
        row(r.lastBy).assists += 1;
      }
      r.lastBy = null;
    },
    accuracy(actor) {
      const r = rows.get(actor.id);
      if (!r || r.shots === 0) return 0;
      return Math.round((r.hits / r.shots) * 100);
    },
    assists(actor) {
      const r = rows.get(actor.id);
      return r ? r.assists : 0;
    },
    shots(actor) {
      const r = rows.get(actor.id);
      return r ? r.shots : 0;
    },
    // Deterministic captures set the table directly instead of playing it out.
    setRow(actor, shots, hits, assists) {
      const r = row(actor);
      r.shots = shots;
      r.hits = hits;
      r.assists = assists;
    },
    reset() {
      rows.clear();
    },
  };
}
