// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain browser
// APIs only: the game asks the canvas for pointer lock and reads movementX/Y while it holds it.
// `pressed` records one-shot key presses (buy keys, grenade, weapon swap); main.js drains
// the set once a frame, so a tap never fires twice.
//
// Touch (mobile Chrome): when the device has a coarse pointer the game shows the touch
// layer instead — a virtual joystick on the left, a look drag on the canvas, and hold/tap
// buttons on the right. Touch drives the same state object (keys, pressed, firing, look),
// so the simulation never knows which device is playing. Pointer lock is desktop-only:
// on touch the play button just hides the overlay, there is nothing to lock.
export function createInput(canvas, onLockChange, opts = {}) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, pressed, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  function clearAll() {
    keys.clear();
    pressed.clear();
    state.firing = false;
    state.aiming = false;
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', clearAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) clearAll();
    onLockChange(state.locked);
  });

  // ---- Touch controls ----
  if (isTouch) {
    document.body.classList.add('touch');
    const touchEl = document.getElementById('touch');
    if (touchEl) touchEl.hidden = false;

    // Look: drag anywhere on the canvas (the right side in practice — the
    // joystick and buttons sit above it and swallow their own touches).
    let lookId = null;
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' || lookId !== null) return;
      lookId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== lookId) return;
      // Finger drags are short: scale them up next to the mouse sensitivity.
      state.lookX += (event.clientX - lastX) * 1.6;
      state.lookY += (event.clientY - lastY) * 1.6;
      lastX = event.clientX;
      lastY = event.clientY;
      event.preventDefault();
    });
    const endLook = (event) => { if (event.pointerId === lookId) lookId = null; };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);

    // Joystick: a fixed base; the knob follows the finger, the direction feeds
    // the same WASD keys the keyboard uses (8-way, dead zone 0.22).
    const zone = document.getElementById('stick-zone');
    const knob = document.getElementById('stick-knob');
    const stickKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    let stickId = null;
    function setStick(dx, dy) {
      for (const code of stickKeys) keys.delete(code);
      const len = Math.hypot(dx, dy);
      if (len < 0.22) return;
      const nx = dx / Math.max(len, 1);
      const ny = dy / Math.max(len, 1);
      if (ny < -0.35) keys.add('KeyW');
      if (ny > 0.35) keys.add('KeyS');
      if (nx > 0.35) keys.add('KeyD');
      if (nx < -0.35) keys.add('KeyA');
    }
    if (zone && knob) {
      const RADIUS = 44;
      zone.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'touch' || stickId !== null) return;
        stickId = event.pointerId;
        zone.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      zone.addEventListener('pointermove', (event) => {
        if (event.pointerId !== stickId) return;
        const rect = zone.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = (event.clientX - cx) / RADIUS;
        let dy = (event.clientY - cy) / RADIUS;
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        knob.style.transform = `translate(calc(-50% + ${dx * RADIUS}px), calc(-50% + ${dy * RADIUS}px))`;
        setStick(dx, dy);
        event.preventDefault();
      });
      const endStick = (event) => {
        if (event.pointerId !== stickId) return;
        stickId = null;
        knob.style.transform = 'translate(-50%, -50%)';
        setStick(0, 0);
      };
      zone.addEventListener('pointerup', endStick);
      zone.addEventListener('pointercancel', endStick);
    }

    // Hold/tap buttons. hold() wires a button to a down/up pair; tap() fires
    // a one-shot press on pointerdown.
    function hold(id, down, up) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        el.setPointerCapture(event.pointerId);
        el.classList.add('down');
        down();
      });
      const release = (event) => {
        el.classList.remove('down');
        up();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    }
    function tap(id, fn) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        el.classList.add('down');
        setTimeout(() => el.classList.remove('down'), 120);
        fn();
      });
    }
    hold('btn-fire', () => { state.firing = true; }, () => { state.firing = false; });
    hold('btn-jump', () => keys.add('Space'), () => keys.delete('Space'));
    hold('btn-crouch', () => keys.add('ControlLeft'), () => keys.delete('ControlLeft'));
    hold('btn-use', () => keys.add('KeyE'), () => keys.delete('KeyE'));
    tap('btn-reload', () => pressed.add('KeyR'));
    tap('btn-swap', () => { if (opts.onSwap) opts.onSwap(); });
    tap('btn-pause', () => { if (opts.onPause) opts.onPause(); });
  }

  return {
    state,
    isTouch,
    requestLock() {
      if (isTouch) return; // no mouse to lock on a phone
      canvas.requestPointerLock();
    },
    // One-shot press from outside the keyboard (touch buttons, tests).
    press(code) {
      pressed.add(code);
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // One-shot presses live on state.pressed; main.js reads them and clears the set
    // once a frame, so no set is allocated per frame.
  };
}
