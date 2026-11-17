// Match state, in one place. main.js owns the one instance; every module reads and
// writes through it, so a round, a kill or a plant is never tracked twice.
export const PHASE = {
  BUY: 'buy',       // buy menu open, round has not started
  LIVE: 'live',     // round running
  ROUND_END: 'roundEnd', // banner shown, short pause, then next round
  MATCH_END: 'matchEnd', // one team reached the target
};

export const TEAM = { JACKALS: 0, WARDENS: 1 };
export const TEAM_NAME = ['Jackals', 'Wardens'];

export const TUNE = {
  roundTime: 100,       // seconds of live play
  buyTime: 15,          // seconds of buy phase
  roundEndTime: 4,      // seconds the banner shows
  plantTime: 3,         // seconds to plant the charge
  defuseTime: 5,        // seconds to defuse
  detonateTime: 35,     // seconds from plant to explosion
  roundsToWin: 5,       // first team to this wins the match
  maxRounds: 9,
  startMoney: 800,
  winMoney: 3250,
  lossMoney: 1900,
  killMoney: 300,
  plantMoney: 300,
  maxMoney: 16000,
  playerHealth: 100,
  botHealth: 100,
};

// One match. Actors (player + bots) live in `actors`; each actor is
// { id, team, isPlayer, alive, health, pos: Vector3-like {x,y,z}, yaw, weapon, money,
//   loadout, kills, deaths, bot } — the sim moves them, the renderer draws them.
export function createMatchState() {
  return {
    phase: PHASE.BUY,
    round: 1,
    phaseTime: TUNE.buyTime, // counts down in the current phase
    roundTimeLeft: TUNE.roundTime,
    score: [0, 0],           // rounds won, indexed by TEAM
    plant: null,             // { site, x, z, plantedAt, defuseBy, defusing, progress }
    charge: null,            // { x, z, site } once planted; visual + beep source
    winner: -1,              // team that won the current/last round
    winReason: '',
    matchWinner: -1,
    actors: [],
    events: [],              // kill feed: { text, team, at }
    noise: [],               // { x, z, at, loud } gunfire bots can hear
    time: 0,                 // match clock, seconds
    roundStartMoney: [0, 0],
  };
}

export function awardMoney(state, team, amount) {
  for (const actor of state.actors) {
    if (actor.team === team && actor.alive) {
      actor.money = Math.min(TUNE.maxMoney, actor.money + amount);
    }
  }
}

export function aliveCount(state, team) {
  let n = 0;
  for (const actor of state.actors) if (actor.team === team && actor.alive) n += 1;
  return n;
}

export function pushEvent(state, text, team) {
  state.events.push({ text, team, at: state.time });
  if (state.events.length > 6) state.events.shift();
}

export function pushNoise(state, x, z, loud) {
  state.noise.push({ x, z, at: state.time, loud: loud ? 1 : 0 });
  if (state.noise.length > 24) state.noise.shift();
}
