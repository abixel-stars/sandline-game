// Match results: per-player kills, deaths, assists and accuracy, the MVP,
// the round history, and Play Again / Back to Lobby. main.js opens it from
// endMatch with the finished match; the buttons call back into main.js.
import { TEAM_NAME } from './state.js';

export function createResults(deps) {
  const root = document.getElementById('results');
  const titleEl = document.getElementById('results-title');
  const subEl = document.getElementById('results-sub');
  const mvpEl = document.getElementById('results-mvp');
  const rowsEl = document.querySelector('#results-rows tbody');
  const historyEl = document.getElementById('results-history');
  const againBtn = document.getElementById('results-again');
  const lobbyBtn = document.getElementById('results-lobby');

  function mvpOf(players) {
    let best = null;
    let bestScore = -Infinity;
    for (const p of players) {
      const score = p.kills * 2 + p.assists - p.deaths;
      if (score > bestScore || (score === bestScore && best && p.deaths < best.deaths)) {
        best = p;
        bestScore = score;
      }
    }
    return best;
  }

  function playerRow(p) {
    const tr = document.createElement('tr');
    if (p.isMvp) tr.className = 'mvp';
    const cells = [p.name, String(p.kills), String(p.deaths), String(p.assists), `${p.accuracy}%`];
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    const team = document.createElement('td');
    team.textContent = p.team === 0 ? 'Jackals' : 'Wardens';
    team.className = p.team === 0 ? 'tj' : 'tw';
    tr.insertBefore(team, tr.firstChild);
    return tr;
  }

  if (againBtn) againBtn.addEventListener('click', () => deps.onPlayAgain());
  if (lobbyBtn) lobbyBtn.addEventListener('click', () => deps.onBackToLobby());

  return {
    get isOpen() {
      return !root.hidden;
    },
    show(match) {
      const winnerName = TEAM_NAME[match.winner];
      titleEl.textContent = `${winnerName} win the match`;
      subEl.textContent = match.mode === 'tdm'
        ? `Deathmatch · first to 20 · ${match.score[0]} — ${match.score[1]}`
        : `Plant / defuse · ${match.score[0]} — ${match.score[1]} · ${match.rounds.length} rounds`;
      const players = match.actors.map((a) => ({
        name: deps.nameOf(a),
        team: a.team,
        kills: a.kills,
        deaths: a.deaths,
        assists: deps.stats.assists(a),
        accuracy: deps.stats.accuracy(a),
        isMvp: false,
      }));
      const mvp = mvpOf(players);
      if (mvp) mvp.isMvp = true;
      players.sort((a, b) => (b.kills * 2 + b.assists - b.deaths) - (a.kills * 2 + a.assists - a.deaths));
      rowsEl.replaceChildren(...players.map(playerRow));
      if (mvp) {
        mvpEl.textContent = `MVP — ${mvp.name} · ${mvp.kills} kills, ${mvp.assists} assists, ${mvp.deaths} deaths`;
      } else {
        mvpEl.textContent = '';
      }
      historyEl.replaceChildren();
      for (const round of match.rounds) {
        const li = document.createElement('li');
        li.textContent = round.label;
        historyEl.appendChild(li);
      }
      if (match.rounds.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No rounds played.';
        historyEl.appendChild(li);
      }
      root.hidden = false;
      if (againBtn) againBtn.focus();
    },
    hide() {
      root.hidden = true;
    },
  };
}
