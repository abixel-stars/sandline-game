// Sound, synthesised only: every effect is built from oscillators and filtered noise
// at run time, so the game ships no audio files and makes no network request.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const length = ctx.sampleRate;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(when, duration, filterType, frequency, gainValue, q = 1) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  function tone(when, type, from, to, duration, gainValue) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, when);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), when + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  // weapon: 'pistol' | 'rifle' | 'smg' | 'sniper' | 'shotgun' | 'enemy' (distant, quieter)
  function shot(weapon, distant) {
    if (!ensure()) return;
    const when = ctx.currentTime;
    const scale = distant ? 0.35 : 1;
    if (weapon === 'sniper') {
      noise(when, 0.28, 'lowpass', 900, 0.9 * scale);
      tone(when, 'sine', 160, 45, 0.3, 0.7 * scale);
    } else if (weapon === 'shotgun') {
      noise(when, 0.22, 'bandpass', 500, 0.9 * scale, 0.8);
      tone(when, 'sine', 130, 40, 0.25, 0.8 * scale);
    } else if (weapon === 'dmr') {
      noise(when, 0.2, 'lowpass', 1200, 0.85 * scale);
      tone(when, 'sine', 200, 50, 0.22, 0.65 * scale);
      tone(when + 0.05, 'square', 900, 900, 0.04, 0.2 * scale);
    } else if (weapon === 'twin') {
      noise(when, 0.26, 'bandpass', 420, 1.0 * scale, 0.7);
      tone(when, 'sine', 110, 32, 0.3, 0.9 * scale);
      noise(when + 0.02, 0.12, 'highpass', 1800, 0.4 * scale);
    } else if (weapon === 'smg') {
      noise(when, 0.08, 'highpass', 1400, 0.5 * scale);
      tone(when, 'square', 220, 90, 0.07, 0.25 * scale);
    } else if (weapon === 'pistol') {
      noise(when, 0.1, 'bandpass', 900, 0.6 * scale, 0.7);
      tone(when, 'sine', 180, 60, 0.12, 0.5 * scale);
    } else {
      noise(when, 0.13, 'bandpass', 700, 0.7 * scale, 0.8);
      tone(when, 'sine', 150, 55, 0.16, 0.6 * scale);
    }
  }

  function click(when, frequency, gainValue) {
    tone(when, 'square', frequency, frequency, 0.03, gainValue);
  }

  return {
    unlock() { ensure(); },
    shot,
    setVolume(level) {
      if (!ensure()) return;
      master.gain.value = Math.min(1, Math.max(0, level));
    },
    dryFire() {
      if (!ensure()) return;
      click(ctx.currentTime, 1400, 0.15);
    },
    reload() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      click(t, 900, 0.2);
      click(t + 0.25, 600, 0.2);
      click(t + 0.9, 1100, 0.25);
    },
    hit(headshot) {
      if (!ensure()) return;
      tone(ctx.currentTime, 'square', headshot ? 1900 : 1300, headshot ? 1900 : 1300, 0.06, 0.25);
    },
    kill() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 'sine', 660, 660, 0.09, 0.25);
      tone(t + 0.09, 'sine', 880, 880, 0.14, 0.25);
    },
    step() {
      if (!ensure()) return;
      noise(ctx.currentTime, 0.06, 'lowpass', 500, 0.08);
    },
    bounce() {
      if (!ensure()) return;
      tone(ctx.currentTime, 'sine', 300, 140, 0.09, 0.2);
    },
    explosion() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 1.4, 'lowpass', 400, 1.0);
      tone(t, 'sine', 90, 28, 1.2, 0.9);
      noise(t + 0.05, 0.5, 'highpass', 2000, 0.4);
    },
    plantBeep(final) {
      if (!ensure()) return;
      tone(ctx.currentTime, 'square', final ? 1500 : 1050, final ? 1500 : 1050, final ? 0.3 : 0.08, 0.2);
    },
    defuseBeep() {
      if (!ensure()) return;
      tone(ctx.currentTime, 'square', 1250, 1250, 0.06, 0.18);
    },
    buy() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 'sine', 990, 990, 0.07, 0.2);
      tone(t + 0.07, 'sine', 1320, 1320, 0.1, 0.2);
    },
    roundEnd(won) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      if (won) {
        tone(t, 'sine', 523, 523, 0.16, 0.25);
        tone(t + 0.16, 'sine', 659, 659, 0.16, 0.25);
        tone(t + 0.32, 'sine', 784, 784, 0.3, 0.25);
      } else {
        tone(t, 'sine', 392, 392, 0.18, 0.25);
        tone(t + 0.18, 'sine', 311, 311, 0.35, 0.25);
      }
    },
    hurt() {
      if (!ensure()) return;
      tone(ctx.currentTime, 'sine', 110, 70, 0.18, 0.35);
    },
    smoke() {
      if (!ensure()) return;
      noise(ctx.currentTime, 0.9, 'bandpass', 3000, 0.12, 0.5);
    },
  };
}
