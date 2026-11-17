// The DOM HUD: health, ammo, timer, score, kill feed, buy menu, banners and the one
// overlay panel. It never touches the simulation; main.js pushes numbers in and reads
// the play callback out. Cached last values keep DOM writes out of the hot path.
import { WEAPONS, GRENADES, BUY_MENU } from './weapons.js';
import { TEAM_NAME } from './state.js';

const COPY = {
  start: {
    title: 'SANDLINE',
    copy: 'Yard 9, dusk. You are Jackals: plant the charge at A or B, or eliminate the Wardens. First to 5 rounds takes the match. Pick your agent in the lobby, then go.',
    action: 'Enter the lobby',
  },
  paused: {
    title: 'SANDLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const moneyEl = $('money');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const timerEl = $('timer');
  const scoreEl = $('score');
  const aliveEl = $('alive');
  const feedEl = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const promptEl = $('prompt');
  const channel = $('channel');
  const channelLabel = $('channel-label');
  const channelFill = $('channel-fill');
  const buyEl = $('buy');
  const buyRows = $('buy-rows');
  const buyMoney = $('buy-money');
  const buyRound = $('buy-round');
  const buyHint = $('buy-hint');
  const buyClose = $('buy-close');
  const damageEl = $('damage');
  const grenadeEl = $('grenades');
  const ammoEl = $('ammo');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyHandler = null;

  // Tap a row to buy (touch); the keyboard path stays exactly as it was.
  const isTouchUI = () => document.body.classList.contains('touch');
  if (buyClose) buyClose.addEventListener('click', () => { buyEl.hidden = true; });

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  // Buy menu rows, built once.
  const rowEls = {};
  for (const item of BUY_MENU) {
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.addEventListener('click', () => { if (buyHandler) buyHandler(item.id); });
    const key = document.createElement('span');
    key.className = 'buy-key';
    key.textContent = item.key;
    const label = document.createElement('span');
    label.className = 'buy-label';
    label.textContent = item.label;
    const price = document.createElement('span');
    price.className = 'buy-price';
    row.append(key, label, price);
    buyRows.appendChild(row);
    rowEls[item.id] = { row, price };
  }

  return {
    setHealth(hp) {
      if (last.hp === hp) return;
      last.hp = hp;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      healthFill.classList.toggle('low', hp <= 30);
    },
    setMoney(n) {
      setText(moneyEl, 'money', `$${n}`);
      if (last.buyMoney !== n) {
        last.buyMoney = n;
        buyMoney.textContent = `$${n}`;
      }
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', reserve === Infinity ? '/ ∞' : `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      ammoEl.classList.toggle('empty', mag === 0);
    },
    setGrenades(frag, smoke) {
      setText(grenadeEl, 'nades', `Frag ${frag} · Smoke ${smoke}`);
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${Math.ceil(seconds)}` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      setText(timerEl, 'timer', text);
      timerEl.classList.toggle('urgent', phase !== 'buy' && seconds <= 10);
    },
    setScore(score, round) {
      const key = `${score[0]}-${score[1]}-${round}`;
      if (last.scoreKey === key) return;
      last.scoreKey = key;
      scoreEl.innerHTML = `<b class="tj">${TEAM_NAME[0]}</b> ${score[0]} — ${score[1]} <b class="tw">${TEAM_NAME[1]}</b> · Round ${round}`;
    },
    setAlive(jackals, wardens) {
      const key = `${jackals}-${wardens}`;
      if (last.aliveKey === key) return;
      last.aliveKey = key;
      aliveEl.innerHTML = `Alive <b class="tj">${jackals}</b> vs <b class="tw">${wardens}</b>`;
    },
    setCrosshair(spreadPx) {
      const px = Math.round(spreadPx);
      if (last.gap === px) return;
      last.gap = px;
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      if (killed) hitmarker.classList.add('kill');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    flashDamage() {
      damageEl.classList.remove('on');
      void damageEl.offsetWidth; // restart the animation
      damageEl.classList.add('on');
    },
    killfeed(text, team) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      line.style.color = team === 0 ? 'var(--accent)' : 'var(--danger)';
      feedEl.appendChild(line);
      // Phones keep three lines; the panel is small and the top bar is crowded.
      const max = isTouchUI() ? 3 : 6;
      while (feedEl.children.length > max) feedEl.removeChild(feedEl.firstChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(titleText, subText, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
    },
    hideBanner() {
      banner.hidden = true;
      clearTimeout(bannerTimer);
    },
    showPrompt(text) {
      if (last.prompt === text) return;
      last.prompt = text;
      promptEl.textContent = text;
      promptEl.hidden = false;
    },
    hidePrompt() {
      if (last.prompt === null) return;
      last.prompt = null;
      promptEl.hidden = true;
    },
    setChannel(label, progress) {
      channel.hidden = false;
      channelLabel.textContent = label;
      channelFill.style.width = `${Math.round(progress * 100)}%`;
    },
    hideChannel() {
      channel.hidden = true;
    },
    showBuy(player, round) {
      buyEl.hidden = false;
      if (round !== undefined) buyRound.textContent = String(round);
      if (buyHint) {
        buyHint.textContent = isTouchUI()
          ? 'Tap an item to buy · Done to close'
          : 'Keys 1–6 to buy · B to close · the round starts when the timer ends';
      }
      this.refreshBuy(player);
    },
    hideBuy() {
      buyEl.hidden = true;
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    refreshBuy(player) {
      for (const item of BUY_MENU) {
        const def = WEAPONS[item.id] || GRENADES[item.id];
        const owned = item.id === 'frag' ? player.loadout.grenades.frag > 0
          : item.id === 'smoke' ? player.loadout.grenades.smoke > 0
          : player.loadout.primary === item.id;
        const afford = player.money >= def.price;
        rowEls[item.id].price.textContent = owned ? '✓ OWNED' : `$${def.price}`;
        rowEls[item.id].row.classList.toggle('cant', !owned && !afford);
        rowEls[item.id].row.classList.toggle('owned', owned);
      }
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'roundEnd' || mode === 'matchEnd' ? detail : text.copy;
      play.textContent = isTouchUI() ? text.action.replace('Click', 'Tap') : text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
