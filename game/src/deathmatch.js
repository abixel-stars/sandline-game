// Team Deathmatch: first team to 20 eliminations takes the match. No charge,
// no rounds, no round timer. A dead player respawns at their own base after
// 3 seconds. Kill totals live in state.score, the same array the plant mode
// uses for rounds, so the match-end flow and the HUD need no special case.
import { TEAM } from './state.js';

export const TDM_TARGET = 20;
export const TDM_RESPAWN = 3;

export function createDeathmatch(deps) {
  const queue = [];
  let active = false;
  const board = document.getElementById('scoreboard');
  const boardJ = document.getElementById('sb-j');
  const boardW = document.getElementById('sb-w');
  const boardRows = document.getElementById('sb-rows');
  let boardOpen = false;

  function fillBoard() {
    if (!board) return;
    const rows = controller.rows();
    if (boardJ) boardJ.textContent = String(deps.state.score[0]);
    if (boardW) boardW.textContent = String(deps.state.score[1]);
    if (boardRows) {
      boardRows.replaceChildren();
      for (const r of rows) {
        const tr = document.createElement('tr');
        const name = document.createElement('td');
        name.textContent = r.name;
        name.className = r.team === 0 ? 'tj' : 'tw';
        const kills = document.createElement('td');
        kills.textContent = String(r.kills);
        const deaths = document.createElement('td');
        deaths.textContent = String(r.deaths);
        tr.append(name, kills, deaths);
        boardRows.appendChild(tr);
      }
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Tab' || !active || boardOpen) return;
    event.preventDefault();
    boardOpen = true;
    fillBoard();
    if (board) board.hidden = false;
  });
  document.addEventListener('keyup', (event) => {
    if (event.code !== 'Tab' || !boardOpen) return;
    boardOpen = false;
    if (board) board.hidden = true;
  });

  const controller = {
    get active() {
      return active;
    },
    start() {
      active = true;
      queue.length = 0;
    },
    stop() {
      active = false;
      queue.length = 0;
    },
    onKill(shooter, target) {
      if (!active || !shooter) return;
      deps.state.score[shooter.team] += 1;
      queue.push({ actor: target, at: deps.state.time + TDM_RESPAWN });
      if (deps.state.score[shooter.team] >= TDM_TARGET) {
        deps.onMatchEnd();
      }
    },
    step() {
      if (!active) return;
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (deps.state.time >= queue[i].at) {
          const entry = queue.splice(i, 1)[0];
          if (!entry.actor.alive) deps.respawnActor(entry.actor);
        }
      }
    },
    // Scoreboard rows, Jackals first, each with kills and deaths.
    rows() {
      const list = deps.state.actors.map((a) => ({
        name: deps.nameOf(a), team: a.team, kills: a.kills, deaths: a.deaths, alive: a.alive,
      }));
      list.sort((a, b) => (a.team - b.team) || (b.kills - a.kills));
      return list;
    },
    leader() {
      return deps.state.score[0] >= deps.state.score[1] ? TEAM.JACKALS : TEAM.WARDENS;
    },
    // The scoreboard refreshes while it is open, so the numbers stay live.
    refreshBoard() {
      if (boardOpen) fillBoard();
    },
  };
  return controller;
}
