// Procedural canvas textures for Yard 9. No network assets, no external files:
// every texture is painted on a 2d canvas at load time from a fixed-seed RNG, so
// the game looks identical on every run (and every screenshot is deterministic).
// Palette stays warm sand + rust + dark steel with the teal accent from palette.js.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

// A clone with a different repeat (shares the painted image, cheap).
export function repeat(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

function speckle(g, w, h, rng, colors, n, rMin, rMax, alpha) {
  for (let i = 0; i < n; i += 1) {
    g.globalAlpha = alpha * (0.4 + rng() * 0.6);
    g.fillStyle = colors[Math.floor(rng() * colors.length)];
    const r = rMin + rng() * (rMax - rMin);
    g.beginPath();
    g.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

// ---- Sand ground: warm base, noise, darker drifts, tire tracks, pebbles ----
export function sandTexture() {
  const [c, g] = canvas(512, 512);
  const rng = mulberry32(901);
  g.fillStyle = '#b98d5f';
  g.fillRect(0, 0, 512, 512);
  // Large soft drifts.
  for (let i = 0; i < 26; i += 1) {
    const x = rng() * 512;
    const y = rng() * 512;
    const r = 40 + rng() * 110;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rng() < 0.5 ? 'rgba(138,106,69,0.28)' : 'rgba(214,164,110,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  speckle(g, 512, 512, rng, ['#8a6a45', '#d6a46e', '#a87c4e', '#c99a68'], 2600, 0.6, 2.4, 0.5);
  // Tire tracks: two dark arcs with tread ticks, crossing the tile.
  for (let t = 0; t < 2; t += 1) {
    const y0 = 90 + t * 260 + rng() * 40;
    g.strokeStyle = 'rgba(90,64,38,0.4)';
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(-10, y0);
    g.bezierCurveTo(150, y0 + 26, 340, y0 - 26, 522, y0 + 8);
    g.stroke();
    g.strokeStyle = 'rgba(90,64,38,0.28)';
    g.lineWidth = 3;
    for (let x = 0; x < 512; x += 18) {
      const y = y0 + Math.sin((x / 512) * Math.PI) * 8;
      g.beginPath();
      g.moveTo(x, y - 8);
      g.lineTo(x + 6, y + 8);
      g.stroke();
    }
  }
  // Scattered pebbles.
  speckle(g, 512, 512, rng, ['#6e5233', '#e8c491', '#7c5a38'], 320, 1, 2.6, 0.8);
  return toTexture(c);
}

// ---- Dark steel panels: vertical seams, rivets, grime streaks ----
export function steelTexture(base = '#3a3f45', dark = '#26292e') {
  const [c, g] = canvas(256, 256);
  const rng = mulberry32(902);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, rng, [dark, '#4a5058', '#2e3237'], 700, 0.6, 2, 0.35);
  // Panel seams every 64 px.
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 1;
  for (let x = 2; x <= 256; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.beginPath();
  g.moveTo(0, 128);
  g.lineTo(256, 128);
  g.stroke();
  // Rivets along the seams.
  g.fillStyle = 'rgba(0,0,0,0.6)';
  for (let x = 0; x <= 256; x += 64) {
    for (let y = 16; y < 256; y += 48) {
      g.beginPath();
      g.arc(x + 5, y, 2.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.arc(x + 4, y - 1, 1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.6)';
    }
  }
  // Grime streaks running down.
  for (let i = 0; i < 14; i += 1) {
    const x = rng() * 256;
    const len = 30 + rng() * 90;
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgba(20,16,12,0.35)');
    grad.addColorStop(1, 'rgba(20,16,12,0)');
    g.fillStyle = grad;
    g.fillRect(x, rng() * 60, 3 + rng() * 5, len);
  }
  return toTexture(c);
}

// ---- Shipping container: corrugated ribs, rails, rust streaks, stencil ----
export function containerTexture(base = '#a85b32', rust = '#7c3f22', stencil = true) {
  const [c, g] = canvas(256, 256);
  const rng = mulberry32(903);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // Corrugation: alternating light / shadow vertical ribs.
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(x, 0, 4, 256);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(x + 8, 0, 5, 256);
  }
  // Top and bottom rails.
  g.fillStyle = rust;
  g.fillRect(0, 0, 256, 14);
  g.fillRect(0, 242, 256, 14);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 14, 256, 2);
  g.fillRect(0, 240, 256, 2);
  // Rust streaks bleeding down from the top rail.
  for (let i = 0; i < 22; i += 1) {
    const x = rng() * 256;
    const len = 20 + rng() * 80;
    const grad = g.createLinearGradient(0, 14, 0, 14 + len);
    grad.addColorStop(0, 'rgba(90,40,18,0.5)');
    grad.addColorStop(1, 'rgba(90,40,18,0)');
    g.fillStyle = grad;
    g.fillRect(x, 14, 2 + rng() * 4, len);
  }
  speckle(g, 256, 256, rng, [rust, '#5e2f16', '#c97a44'], 500, 0.6, 2.2, 0.4);
  // Stencil number, low contrast so it reads as paint, not a sign. Skipped on
  // horizontal faces (e.g. the tower roof), where the texture reads mirrored.
  if (stencil) {
    g.fillStyle = 'rgba(245,239,228,0.55)';
    g.font = 'bold 26px ui-monospace, monospace';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('Y9-04', 18, 40);
  }
  return toTexture(c);
}

// ---- Wood crate: planks, edge frame, diagonal brace ----
export function crateTexture() {
  const [c, g] = canvas(256, 256);
  const rng = mulberry32(904);
  g.fillStyle = '#8a6a45';
  g.fillRect(0, 0, 256, 256);
  // Horizontal planks.
  for (let y = 0; y < 256; y += 42) {
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.08)';
    g.fillRect(0, y, 256, 3);
    g.strokeStyle = 'rgba(60,40,20,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, y + 42);
    g.lineTo(256, y + 42);
    g.stroke();
  }
  speckle(g, 256, 256, rng, ['#6e5233', '#a87c4e', '#77562f'], 500, 0.6, 2, 0.35);
  // Edge frame + diagonal brace, darker timber.
  g.strokeStyle = '#5e4426';
  g.lineWidth = 18;
  g.strokeRect(9, 9, 238, 238);
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(18, 18);
  g.lineTo(238, 238);
  g.stroke();
  // Corner bolts.
  g.fillStyle = '#2e2113';
  for (const [x, y] of [[22, 22], [234, 22], [22, 234], [234, 234]]) {
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c);
}

// ---- Barrel: horizontal bands + rust ----
export function barrelTexture(base = '#a85b32') {
  const [c, g] = canvas(256, 256);
  const rng = mulberry32(905);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, rng, ['#7c3f22', '#c97a44', '#5e2f16'], 600, 0.6, 2.2, 0.4);
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(0, 52, 256, 8);
  g.fillRect(0, 196, 256, 8);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(0, 60, 256, 3);
  g.fillRect(0, 204, 256, 3);
  for (let i = 0; i < 10; i += 1) {
    const x = rng() * 256;
    const grad = g.createLinearGradient(0, 52, 0, 52 + 40 + rng() * 60);
    grad.addColorStop(0, 'rgba(90,40,18,0.45)');
    grad.addColorStop(1, 'rgba(90,40,18,0)');
    g.fillStyle = grad;
    g.fillRect(x, 52, 3, 100);
  }
  return toTexture(c);
}

// ---- Dusk sky dome: indigo zenith, magenta band, hot orange horizon, clouds.
// Canvas top = zenith, canvas middle = horizon (sphere equator), bottom = nadir.
export function skyTexture() {
  const [c, g] = canvas(1024, 512);
  const rng = mulberry32(906);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#241a3e');
  grad.addColorStop(0.28, '#4a2a52');
  grad.addColorStop(0.42, '#8a3f4d');
  grad.addColorStop(0.5, '#e07a3e');
  grad.addColorStop(0.56, '#f7a44e');
  grad.addColorStop(0.66, '#7c4a30');
  grad.addColorStop(1, '#241a12');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  // Faint stars near the zenith.
  for (let i = 0; i < 130; i += 1) {
    g.globalAlpha = 0.15 + rng() * 0.5;
    g.fillStyle = '#f5efe4';
    g.fillRect(rng() * 1024, rng() * 110, 1.4, 1.4);
  }
  g.globalAlpha = 1;
  // Soft dusk clouds: warm-lit bellies, purple tops.
  for (let i = 0; i < 26; i += 1) {
    const x = rng() * 1024;
    const y = 120 + rng() * 150;
    const w = 90 + rng() * 220;
    const h = 10 + rng() * 22;
    const cg = g.createRadialGradient(x, y, 0, x, y, w / 2);
    cg.addColorStop(0, rng() < 0.5 ? 'rgba(247,164,78,0.20)' : 'rgba(120,70,110,0.22)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg;
    g.save();
    g.translate(x, y);
    g.scale(1, h / w);
    g.beginPath();
    g.arc(0, 0, w / 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  return toTexture(c);
}

// ---- Uniform fabric: team base, camo blotches, stitching, chest pocket ----
export function uniformTexture(team = '#2ec4b6') {
  const [c, g] = canvas(256, 256);
  const rng = mulberry32(907);
  g.fillStyle = team;
  g.fillRect(0, 0, 256, 256);
  // Camo blotches: darker and lighter patches of the same hue family.
  const shades = ['rgba(0,0,0,0.22)', 'rgba(0,0,0,0.14)', 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.30)'];
  for (let i = 0; i < 22; i += 1) {
    const x = rng() * 256;
    const y = rng() * 256;
    const r = 14 + rng() * 34;
    g.fillStyle = shades[Math.floor(rng() * shades.length)];
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rng() * 0.6), rng() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  speckle(g, 256, 256, rng, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.14)'], 500, 0.6, 1.8, 0.4);
  // Stitching: dashed seams top and bottom, pocket outline centre-left.
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 2;
  g.setLineDash([6, 5]);
  g.beginPath(); g.moveTo(0, 18); g.lineTo(256, 18); g.stroke();
  g.beginPath(); g.moveTo(0, 238); g.lineTo(256, 238); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 3;
  g.strokeRect(52, 96, 84, 62);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(52, 96, 84, 8);
  // Chest tab: pale stencil initials, reads as a name tape.
  g.fillStyle = 'rgba(245,239,228,0.75)';
  g.font = 'bold 20px ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Y9', 94, 128);
  return toTexture(c);
}

// ---- Helmet: dark shell, team band, rivets, scuffs ----
export function helmetTexture(team = '#2ec4b6') {
  const [c, g] = canvas(256, 256);
  const rng = mulberry32(908);
  g.fillStyle = '#26292e';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, rng, ['#3a3f45', '#17191c', '#4a5058'], 700, 0.6, 2, 0.35);
  // Team band across the middle (maps to a latitude band on the dome).
  g.fillStyle = team;
  g.fillRect(0, 108, 256, 30);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 108, 256, 4);
  g.fillRect(0, 134, 256, 4);
  // Rivets along the band.
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let x = 16; x < 256; x += 48) {
    g.beginPath();
    g.arc(x, 123, 3, 0, Math.PI * 2);
    g.fill();
  }
  // Scuffs: light scratches over the shell.
  g.strokeStyle = 'rgba(245,239,228,0.20)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 18; i += 1) {
    const x = rng() * 256;
    const y = rng() * 256;
    const len = 6 + rng() * 22;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + (rng() - 0.5) * 8);
    g.stroke();
  }
  return toTexture(c);
}

// ---- Skin: warm tone, soft noise, darker crown shadow ----
export function skinTexture() {
  const [c, g] = canvas(128, 128);
  const rng = mulberry32(909);
  g.fillStyle = '#d9a066';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, rng, ['#c98f56', '#e8b878', '#b57e4c'], 420, 0.5, 1.6, 0.35);
  // Crown shadow: the top of the head sits under the helmet.
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(60,35,15,0.35)');
  grad.addColorStop(1, 'rgba(60,35,15,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 64);
  return toTexture(c);
}

// ---- Trousers: dark cloth, seams, knee wear ----
export function trouserTexture() {
  const [c, g] = canvas(128, 256);
  const rng = mulberry32(910);
  g.fillStyle = '#26292e';
  g.fillRect(0, 0, 128, 256);
  speckle(g, 128, 256, rng, ['#3a3f45', '#17191c', '#2e3237'], 500, 0.6, 1.8, 0.35);
  // Centre seam and knee wear patches.
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(20, 96, 88, 44);
  g.fillRect(20, 180, 88, 30);
  return toTexture(c);
}

// ---- Gunmetal: brushed dark steel, wear on the edges ----
export function gunMetalTexture() {
  const [c, g] = canvas(256, 256);
  const rng = mulberry32(911);
  g.fillStyle = '#2e3237';
  g.fillRect(0, 0, 256, 256);
  // Horizontal brush lines.
  for (let y = 0; y < 256; y += 3) {
    g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)';
    g.fillRect(0, y, 256, 1);
  }
  speckle(g, 256, 256, rng, ['#4a5058', '#17191c', '#565d66'], 420, 0.6, 1.8, 0.3);
  // Wear: bright nicks along the top and bottom edges.
  g.fillStyle = 'rgba(220,225,230,0.35)';
  for (let i = 0; i < 26; i += 1) {
    const x = rng() * 256;
    g.fillRect(x, rng() < 0.5 ? 0 : 252, 2 + rng() * 8, 3);
  }
  // Screws.
  g.fillStyle = 'rgba(0,0,0,0.6)';
  for (const [x, y] of [[32, 32], [224, 32], [32, 224], [224, 224], [128, 128]]) {
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.stroke();
  }
  return toTexture(c);
}

// ---- Polymer grip: stippled dark plastic, finger grooves ----
export function polymerTexture() {
  const [c, g] = canvas(128, 128);
  const rng = mulberry32(912);
  g.fillStyle = '#1d1f22';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, rng, ['#2e3237', '#101214', '#3a3f45'], 900, 0.5, 1.4, 0.5);
  // Finger grooves: three dark bands.
  g.fillStyle = 'rgba(0,0,0,0.4)';
  for (let y = 28; y < 128; y += 32) g.fillRect(0, y, 128, 7);
  return toTexture(c);
}

// ---- Soft radial glow (sun disc, muzzle-style halo). ----
export function glowTexture() {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,220,160,0.85)');
  grad.addColorStop(0.6, 'rgba(255,150,60,0.28)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return toTexture(c);
}

// ---- Signs: auto-fit text, never clipped. Wide canvas (4:1) for word signs. ----
export function signTexture(text, fg, bg) {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 256);
  // Border plate.
  g.strokeStyle = fg;
  g.globalAlpha = 0.85;
  g.lineWidth = 8;
  g.strokeRect(10, 10, 1004, 236);
  g.globalAlpha = 1;
  // Shrink the font until the whole word fits.
  let size = 168;
  g.font = `bold ${size}px system-ui, sans-serif`;
  while (size > 40 && g.measureText(text).width > 920) {
    size -= 6;
    g.font = `bold ${size}px system-ui, sans-serif`;
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 134);
  const tex = toTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
