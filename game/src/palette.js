// SANDLINE look plan, in one place. Dusk in a desert-industrial yard: warm sand and rust
// under a low sun, dark steel for structure, one teal accent for HUD and team marks.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  sky: '#e08a4c',      // dusk sky / fog colour
  canvas: '#241a12',   // ground haze at the map edge
  sand: '#b98d5f',     // ground
  sandDark: '#8a6a45', // ground variation / worn patches
  rust: '#a85b32',     // containers, barrels
  rustDark: '#7c3f22',
  steel: '#3a3f45',    // walls, beams
  steelDark: '#26292e',
  ink: '#f5efe4',      // HUD text
  muted: '#c9b69a',    // dim HUD text
  accent: '#2ec4b6',   // teal: HUD, Jackals mark
  danger: '#e4572e',   // Wardens mark, damage
  gold: '#f0a830',     // money, muzzle flash
};

export function shade(name) {
  return PALETTE[name];
}
