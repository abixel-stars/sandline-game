// Settings: mouse sensitivity, master volume, graphics quality and touch
// layout. Stored in localStorage, applied at boot and whenever the player
// saves. The screen lives in index.html; this module only wires it. The
// game reads sensitivity straight from here every frame, so no other module
// has to know about settings at all.
const KEY = 'sandline-settings-v1';
export const SETTINGS_DEFAULTS = { sens: 1, volume: 0.5, quality: 'high', touch: 'default' };

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...SETTINGS_DEFAULTS };
    const parsed = JSON.parse(raw);
    const out = { ...SETTINGS_DEFAULTS };
    if (typeof parsed.sens === 'number') out.sens = Math.min(2, Math.max(0.5, parsed.sens));
    if (typeof parsed.volume === 'number') out.volume = Math.min(1, Math.max(0, parsed.volume));
    if (parsed.quality === 'low' || parsed.quality === 'high') out.quality = parsed.quality;
    if (parsed.touch === 'compact' || parsed.touch === 'default') out.touch = parsed.touch;
    return out;
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function saveSettings(values) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(values));
  } catch {
    // Private mode or no storage: the game still plays on defaults.
  }
}

export function createSettings(deps) {
  const values = loadSettings();
  const root = document.getElementById('settings');
  const sensEl = document.getElementById('set-sens');
  const sensVal = document.getElementById('set-sens-val');
  const volEl = document.getElementById('set-vol');
  const volVal = document.getElementById('set-vol-val');
  const qualityEl = document.getElementById('set-quality');
  const touchEl = document.getElementById('set-touch');
  const openBtn = document.getElementById('settings-open');
  const saveBtn = document.getElementById('settings-save');
  const backBtn = document.getElementById('settings-back');

  function paint() {
    if (sensEl) sensEl.value = String(values.sens);
    if (sensVal) sensVal.textContent = `${values.sens.toFixed(2)}x`;
    if (volEl) volEl.value = String(values.volume);
    if (volVal) volVal.textContent = `${Math.round(values.volume * 100)}%`;
    if (qualityEl) qualityEl.value = values.quality;
    if (touchEl) touchEl.value = values.touch;
  }

  function apply() {
    if (deps.audio) deps.audio.setVolume(values.volume);
    if (deps.onQuality) deps.onQuality(values.quality);
    document.body.classList.toggle('touch-compact', values.touch === 'compact');
  }

  function read() {
    if (sensEl) values.sens = Number(sensEl.value) || 1;
    if (volEl) values.volume = Number(volEl.value) || 0;
    if (qualityEl) values.quality = qualityEl.value;
    if (touchEl) values.touch = touchEl.value;
    saveSettings(values);
    paint();
    apply();
  }

  if (sensEl) sensEl.addEventListener('input', read);
  if (volEl) volEl.addEventListener('input', read);
  if (qualityEl) qualityEl.addEventListener('change', read);
  if (touchEl) touchEl.addEventListener('change', read);
  if (openBtn) openBtn.addEventListener('click', () => {
    paint();
    root.hidden = false;
    if (saveBtn) saveBtn.focus();
  });
  if (backBtn) backBtn.addEventListener('click', () => { root.hidden = true; });
  if (saveBtn) saveBtn.addEventListener('click', () => { read(); root.hidden = true; });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && !root.hidden) root.hidden = true;
  });

  return {
    get values() {
      return values;
    },
    apply,
    open() {
      paint();
      root.hidden = false;
    },
    close() {
      root.hidden = true;
    },
  };
}
