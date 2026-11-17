// The pre-match lobby: your agent on the turntable, both rosters, the
// briefing, and the one button that starts the match. main.js opens it from
// the start screen and closes it when the match begins. The 3D preview
// lives in preview.js; this file only owns the panel and the rosters.
import { createShowcase } from './preview.js';
import { passiveLine } from './passives.js';

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
  const passiveEl = $('agent-passive');
  const dotsEl = $('agent-dots');
  const jackalsEl = $('roster-jackals');
  const wardensEl = $('roster-wardens');
  const eyebrowEl = root.querySelector('.eyebrow');
  const pickedEl = $('picked-line');
  const showcase = createShowcase($('agent-view'));

  let index = 0;
  let open = false;
  let mapPick = 'yard9';
  let modePick = 'plant';

  function paintPickers() {
    for (const [id, value] of [['map-y9', 'yard9'], ['map-y10', 'yard10']]) {
      const el = $(id);
      if (el) el.classList.toggle('on', mapPick === value);
    }
    for (const [id, value] of [['mode-plant', 'plant'], ['mode-tdm', 'tdm']]) {
      const el = $(id);
      if (el) el.classList.toggle('on', modePick === value);
    }
    const mapName = mapPick === 'yard10' ? 'Yard 10 Night' : 'Yard 9 Dusk';
    const modeName = modePick === 'tdm' ? 'Deathmatch · first to 20' : 'Plant / Defuse · first to 5';
    if (eyebrowEl) eyebrowEl.textContent = `${mapName.toUpperCase()} · 4V4 · ${modePick === 'tdm' ? 'FIRST TO 20' : 'FIRST TO 5'}`;
    if (pickedEl) pickedEl.textContent = `${mapName} · ${modeName}`;
    const briefMap = $('brief-map');
    if (briefMap) {
      briefMap.innerHTML = mapPick === 'yard10'
        ? '<b>Map</b> Yard 10 — the same yard after dark, under floodlights.'
        : '<b>Map</b> Yard 9 — a desert-industrial yard at dusk.';
    }
    const briefMode = $('brief-mode');
    if (briefMode) {
      briefMode.innerHTML = modePick === 'tdm'
        ? '<b>Mode</b> Deathmatch. First to 20 eliminations takes the match.'
        : '<b>Mode</b> Plant / defuse. First to 5 rounds takes the match.';
    }
  }

  function wirePick(id, fn) {
    const el = $(id);
    if (el) el.addEventListener('click', fn);
  }
  wirePick('map-y9', () => { mapPick = 'yard9'; paintPickers(); });
  wirePick('map-y10', () => { mapPick = 'yard10'; paintPickers(); });
  wirePick('mode-plant', () => { modePick = 'plant'; paintPickers(); });
  wirePick('mode-tdm', () => { modePick = 'tdm'; paintPickers(); });

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
    if (passiveEl) passiveEl.textContent = passiveLine(agent.call);
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
    selection() {
      return { map: mapPick, mode: modePick, agent: JACKALS[index].call };
    },
    setSelection(sel) {
      if (sel.map === 'yard9' || sel.map === 'yard10') mapPick = sel.map;
      if (sel.mode === 'plant' || sel.mode === 'tdm') modePick = sel.mode;
      if (typeof sel.agent === 'number') showAgent(sel.agent);
      paintPickers();
    },
    open(shotMode) {
      root.hidden = false;
      open = true;
      paintPickers();
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
