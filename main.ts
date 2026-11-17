// SANDLINE for best-game-01: the hand-in program. Node 22, standard library
// only, no build step. It takes this directory's game/ (the playable game as
// plain static files) and screenshots/ (3 or 4 renders, the first by name the
// cover), copies both into the output directory, and writes the dossier the
// judge reads with the vendored make.fun library.
//
//   node serve.ts                    play it at http://localhost:8080
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//                                    hand it in to out/ instead of /output
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where this file sits, and where the hand-in goes: /output in the grader,
// MAKEFUN_OUTPUT_DIR anywhere else.
const root = fileURLToPath(new URL('.', import.meta.url));
const dest = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// game/ first, then screenshots/ beside it.
mkdirSync(dest, { recursive: true });
cpSync(join(root, 'game'), join(dest, 'game'), { recursive: true });
const shots = join(root, 'screenshots');
if (existsSync(shots)) {
  cpSync(shots, join(dest, 'screenshots'), { recursive: true });
}

// The caps are the bounty's own (gate.json): the text cap shapes the dossier,
// the rest refuse an entry the scorer would refuse.
const dossier = buildDossier(dest, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(dest, 'dossier.json'), dossier);

// A one-line receipt, so a double run can be compared by eye as well as by hash.
const shotsIn = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
console.log(`handed in ${shotsIn.length} screenshots, dossier ${dossier.length} bytes -> ${dest}`);
