// The pre-match lobby: your agent on the turntable, both rosters, the
// briefing, and the one button that starts the match. main.js opens it from
// the start screen and closes it when the match begins. The 3D preview
// lives in preview.js; this file only owns the panel and the rosters.
import { createShowcase } from './preview.js';

// Your side, Jackals, in the order the match spawns them. The callsigns match
// the bots' names in bot.js; the roles and notes are the lobby's own.
const JACKALS = [
  { call: 'YOU', role: 'Point', gun: 'rifle', gunName: 'VK-47 Dune', note: 'First through the door.' },
  { call: 'DUNE', role: 'Anchor', gun: 'rifle', gunName: 'VK-47 Dune', note: 'Holds mid. Never rushes.' },
  { call: 'ROOK', role: 'Flank', gun: 'smg', gunName: 'Jackal-9', note: 'Circles wide, hits late.' },
  { call: 'VEX', role: 'Support', gun: 'shotgun', gunName: 'Breacher 12', note: 'Clears corners, plants fast.' },
];
const WARDENS = [
  { call: 'SABLE', role: 'Lead', gunName: 'VK-47 Dune' },
  { call: 'HAWK', role: 'Marksman', gunName: 'Longshot .50' },
  { call: 'IRIS', role: 'Flanker', gunName: 'Jackal-9' },
  { call: 'NOX', role: 'Breacher', gunName: 'Breacher 12' },
];

const TEAL = '#2ec4b6';
const ORANGE = '#e4572e';

export function createLobby(hooks) {
  const $ = (id) => document.getElementById(id);
  const root = $('lobby');
  const callEl = $('agent-call');
  const roleEl = $('agent-role');
  const gunEl = $('agent-gun');
  const noteEl = $('agent-note');
  const dotsEl = $('agent-dots');
  const jackalsEl = $('roster-jackals');
  const wardensEl = $('roster-wardens');
  const showcase = createShowcase($('agent-view'));

  let index = 0;
  let open = false;

  function rosterRow(name, role, gun, color, active) {
    const li = document.createElement('li');
    if (active) li.className = 'active';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = color;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = name;
    const what = document.createElement('span');
    what.className = 'what';
    what.textContent = `${role} · ${gun}`;
    li.append(dot, who, what);
    return li;
  }

  function renderRosters() {
    jackalsEl.replaceChildren(
      ...JACKALS.map((a, i) => rosterRow(a.call, a.role, a.gunName, TEAL, i === index)),
    );
    wardensEl.replaceChildren(
      ...WARDENS.map((a) => rosterRow(a.call, a.role, a.gunName, ORANGE, false)),
    );
  }

  function showAgent(i) {
    index = ((i % JACKALS.length) + JACKALS.length) % JACKALS.length;
    const agent = JACKALS[index];
    callEl.textContent = agent.call;
    roleEl.textContent = agent.role;
    gunEl.textContent = agent.gunName;
    noteEl.textContent = agent.note;
    dotsEl.textContent = JACKALS.map((_, d) => (d === index ? '●' : '○')).join(' ');
    showcase.setAgent({ gun: agent.gun, color: TEAL });
    renderRosters();
  }

  $('agent-prev').addEventListener('click', () => showAgent(index - 1));
  $('agent-next').addEventListener('click', () => showAgent(index + 1));
  $('lobby-start').addEventListener('click', () => hooks.onStart());
  $('lobby-back').addEventListener('click', () => hooks.onBack());

  return {
    get isOpen() {
      return open;
    },
    open(shotMode) {
      root.hidden = false;
      open = true;
      showAgent(index);
      if (shotMode) showcase.paint();
      else showcase.start();
    },
    close() {
      open = false;
      showcase.stop();
      root.hidden = true;
    },
    // One still frame of the stage, for deterministic captures.
    paint() {
      showcase.paint();
    },
  };
}
