// Agent passives: one trait per Jackals agent, keyed by lobby callsign.
// The lobby shows the trait on the agent card; the match applies it to the
// player who picked that agent. Numbers live here, nowhere else.
export const PASSIVES = {
  YOU: { name: 'Quick Hands', text: 'Reloads 30% faster.', drain: 0.43, health: 0, speed: 1, mag: 0 },
  DUNE: { name: 'Bulwark', text: '+25 health.', drain: 0, health: 25, speed: 1, mag: 0 },
  ROOK: { name: 'Swift', text: 'Moves 12% faster.', drain: 0, health: 0, speed: 1.12, mag: 0 },
  VEX: { name: 'Deep Pockets', text: '+8 rounds per magazine.', drain: 0, health: 0, speed: 1, mag: 8 },
};

export function passiveFor(call) {
  return PASSIVES[call] || PASSIVES.YOU;
}

export function passiveLine(call) {
  const p = passiveFor(call);
  return `${p.name} — ${p.text}`;
}

// Runs every fixed step for the player: drains a reload faster and tops a
// fresh magazine up once. Pure additions to the weapon state, no def changes.
export function applyPassiveStep(weapon, passive, dt) {
  if (!weapon || !passive) return;
  if (passive.drain > 0 && weapon.reloadLeft > 0) {
    weapon.reloadLeft = Math.max(0, weapon.reloadLeft - dt * passive.drain);
  }
  if (passive.mag > 0 && weapon.reloadLeft === 0) {
    if (weapon.mag === weapon.def.mag && !weapon.magTopped) {
      weapon.mag += passive.mag;
      weapon.magTopped = true;
    } else if (weapon.mag < weapon.def.mag) {
      weapon.magTopped = false;
    }
  }
}
