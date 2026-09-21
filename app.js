// ============================================================
//  APP.JS — игровая логика Studs Rush
// ============================================================
(function () {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor("#15151c"); tg.setBackgroundColor("#15151c"); } catch (e) {}
  }

  let state = null;
  let pendingTaps = 0;      // тапы, ещё не отправленные на сервер
  let syncTimer = null;
  let adsgramClicker = null;
  let adsgramEnergy = null;

  // ---------- УТИЛИТЫ ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function formatNumber(n) {
    n = Math.floor(n);
    if (n < 1000) return String(n);
    const units = ["", "K", "M", "B", "T"];
    let u = 0;
    let v = n;
    while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
    return (v >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : 2)) + units[u];
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function haptic(style) {
    try { tg?.HapticFeedback?.impactOccurred(style || "light"); } catch (e) {}
  }

  // ---------- ЗАГРУЗКА СОСТОЯНИЯ ----------
  async function init() {
    try {
      state = await API.fetchState();
    } catch (err) {
      // Backend не ответил (например, ещё "просыпается" после сна на Render)
      // или отклонил запрос — не даём всему приложению зависнуть,
      // продолжаем в локальном режиме, чтобы кнопки оставались рабочими.
      console.error("fetchState failed, falling back to local state:", err);
      state = API.loadLocalState();
      setTimeout(() => toast("Нет связи с сервером — играем локально"), 500);
    }
    applyOfflineEarnings();
    renderProfile();
    renderBalance();
    renderEnergy();
    renderShop();
    renderFriends();
    renderTasks();
    bindEvents();
    startLoops();
    initAdsgram();
  }

  function applyOfflineEarnings() {
    const now = Date.now();
    const last = state.lastSeen || now;
    const elapsedSec = Math.max(0, Math.floor((now - last) / 1000));
    if (elapsedSec > 0 && state.perSecond > 0) {
      // офлайн-доход капаем максимум за 3 часа, чтобы не абузили переводом времени на телефоне
      const cappedSec = Math.min(elapsedSec, 3 * 3600);
      const gained = Math.floor(cappedSec * state.perSecond);
      if (gained > 0) {
        state.balance += gained;
        toast(`Пока тебя не было, начислено +${formatNumber(gained)} стадсов`);
      }
    }
    // восстановление энергии за то время, пока не заходил
    const regen = Math.min(state.energyMax, state.energy + elapsedSec * CONFIG.ENERGY_REGEN_PER_SEC);
    state.energy = regen;
    state.lastSeen = now;
    persist();
  }

  function persist() {
    if (!API.hasBackend) API.saveLocalState(state);
  }

  // ---------- РЕНДЕР ----------
  function renderProfile() {
    $("#username").textContent = state.username || "Игрок";
    const tgUser = tg?.initDataUnsafe?.user;
    if (tgUser?.photo_url) $("#avatar").src = tgUser.photo_url;

    const level = levelFromBalance(state.balance);
    $("#levelLabel").textContent = "Ур. " + level.level;
    $("#levelFill").style.width = level.progressPct + "%";
  }

  function levelFromBalance(balance) {
    // каждый следующий уровень требует в ~1.6 раза больше суммарно заработанных стадсов
    let level = 1, threshold = 1000, prevThreshold = 0;
    while (balance >= threshold) {
      level++;
      prevThreshold = threshold;
      threshold = Math.floor(threshold * 1.6);
    }
    const progressPct = Math.min(100, ((balance - prevThreshold) / (threshold - prevThreshold)) * 100);
    return { level, progressPct };
  }

  function renderBalance() {
    $("#balance").textContent = formatNumber(state.balance);
    $("#perHourValue").textContent = "+" + formatNumber(state.perSecond * 3600);
  }

  function renderEnergy() {
    $("#energyLabel").textContent = `${Math.floor(state.energy)} / ${state.energyMax}`;
    $("#energyFill").style.width = (state.energy / state.energyMax * 100) + "%";
  }

  function upgradeCost(def, level) {
    return Math.floor(def.baseCost * Math.pow(def.costMul, level));
  }

  function renderShop() {
    const activeCat = $(".shop-tab.active")?.dataset.cat || "click";
    const list = activeCat === "click" ? CONFIG.CLICK_UPGRADES : CONFIG.PASSIVE_UPGRADES;
    const container = $("#shopList");
    container.innerHTML = "";
    list.forEach((def) => {
      const level = state.upgrades[def.id] || 0;
      const cost = upgradeCost(def, level);
      const affordable = state.balance >= cost;
      const card = document.createElement("div");
      card.className = "shop-item" + (affordable ? "" : " disabled");
      card.innerHTML = `
        <div class="shop-item-icon">${activeCat === "click" ? "👆" : "⚙️"}</div>
        <div class="shop-item-info">
          <div class="shop-item-name">${def.name}</div>
          <div class="shop-item-sub">Ур. ${level} · +${def.effect}${activeCat === "click" ? "/тап" : "/сек"}</div>
        </div>
        <button class="shop-item-buy" data-id="${def.id}" data-cat="${activeCat}">
          <img src="изображения/coin.svg" class="coin-icon-sm" alt="">${formatNumber(cost)}
        </button>
      `;
      container.appendChild(card);
    });
  }

  function renderFriends() {
    $("#refCount").textContent = state.referrals.length;
    const earned = state.referrals.reduce((s, r) => s + (r.earned || 0), 0);
    $("#refEarned").textContent = formatNumber(earned);

    const listEl = $("#refList");
    if (!state.referrals.length) {
      listEl.innerHTML = `<div class="empty-hint">Пока никого нет — поделись ссылкой выше</div>`;
      return;
    }
    listEl.innerHTML = state.referrals.map(r => `
      <div class="ref-item">
        <div class="ref-item-name">${r.name || "Друг"}</div>
        <div class="ref-item-earned">+${formatNumber(r.earned || 0)}</div>
      </div>
    `).join("");
  }

  function renderTasks() {
    const listEl = $("#taskList");
    listEl.innerHTML = CONFIG.TASKS.map(t => {
      const done = state.completedTasks.includes(t.id);
      return `
        <div class="task-item ${done ? "done" : ""}">
          <div class="task-item-info">
            <div class="task-item-title">${t.title}</div>
            <div class="task-item-sub">+${formatNumber(t.reward)} стадсов</div>
          </div>
          <button class="task-item-btn" data-id="${t.id}" data-url="${t.url}" ${done ? "disabled" : ""}>
            ${done ? "Готово" : "Перейти"}
          </button>
        </div>
      `;
    }).join("");
  }

  // ---------- ТАПЫ ПО МОНЕТЕ ----------
  function handleTap(e) {
    if (state.energy < CONFIG.ENERGY_COST_PER_TAP) {
      toast("Энергия закончилась — жди восстановления или смотри рекламу");
      return;
    }
    state.energy -= CONFIG.ENERGY_COST_PER_TAP;
    state.balance += state.perClick;
    pendingTaps += 1;

    renderBalance();
    renderEnergy();
    spawnFloatingGain(e, state.perClick);
    haptic("light");
    schedulePersist();
    scheduleSync();
  }

  function spawnFloatingGain(e, amount) {
    const stage = $(".coin-stage");
    const rect = stage.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    const x = (point.clientX ?? rect.width / 2) - rect.left;
    const y = (point.clientY ?? rect.height / 2) - rect.top;

    const el = document.createElement("div");
    el.className = "floating-gain";
    el.textContent = "+" + formatNumber(amount);
    el.style.left = x + "px";
    el.style.top = y + "px";
    stage.appendChild(el);
    setTimeout(() => el.remove(), 900);

    const btn = $("#coinBtn");
    btn.classList.remove("bump");
    void btn.offsetWidth;
    btn.classList.add("bump");
  }

  let persistTimer = null;
  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => { state.lastSeen = Date.now(); persist(); }, 400);
  }

  function scheduleSync() {
    if (!API.hasBackend) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      const toSend = pendingTaps;
      pendingTaps = 0;
      if (toSend > 0) {
        try {
          const res = await API.sendTaps(toSend);
          if (res) applyServerState(res);
        } catch (err) {
          console.error(err);
          pendingTaps += toSend; // вернуть, попробуем позже
        }
      }
    }, 1500);
  }

  function applyServerState(res) {
    if (!res) return;
    state = { ...state, ...res };
    renderBalance();
    renderEnergy();
    renderProfile();
  }

  // ---------- ПАССИВНЫЙ ДОХОД (тик раз в секунду) ----------
  function startLoops() {
    setInterval(() => {
      if (state.perSecond > 0) {
        state.balance += state.perSecond;
        renderBalance();
      }
      if (state.energy < state.energyMax) {
        state.energy = Math.min(state.energyMax, state.energy + CONFIG.ENERGY_REGEN_PER_SEC);
        renderEnergy();
      }
    }, 1000);

    setInterval(() => { state.lastSeen = Date.now(); persist(); }, 5000);
  }

  // ---------- МАГАЗИН: ПОКУПКА ----------
  async function buyUpgrade(id, cat) {
    const list = cat === "click" ? CONFIG.CLICK_UPGRADES : CONFIG.PASSIVE_UPGRADES;
    const def = list.find(u => u.id === id);
    if (!def) return;
    const level = state.upgrades[id] || 0;
    const cost = upgradeCost(def, level);
    if (state.balance < cost) { toast("Недостаточно стадсов"); return; }

    state.balance -= cost;
    state.upgrades[id] = level + 1;
    if (cat === "click") state.perClick += def.effect;
    else state.perSecond += def.effect;

    renderBalance();
    renderShop();
    haptic("medium");
    persist();

    if (API.hasBackend) {
      try {
        const res = await API.buyUpgrade(id);
        applyServerState(res);
      } catch (err) { console.error(err); }
    }
  }

  // ---------- РЕФЕРАЛЬНАЯ ССЫЛКА ----------
  function getRefLink() {
    const uid = state.id;
    return `https://t.me/${CONFIG.BOT_USERNAME}/${CONFIG.APP_SHORT_NAME}?startapp=ref_${uid}`;
  }

  function openInvite() {
    const link = getRefLink();
    const text = "Залетай качать стадсы в Studs Rush! 🚀";
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    } else {
      window.open(link, "_blank");
    }
  }

  function copyLink() {
    const link = getRefLink();
    navigator.clipboard?.writeText(link).then(
      () => toast("Ссылка скопирована"),
      () => toast(link)
    );
  }

  // ---------- РЕКЛАМА (Adsgram) ----------
  function initAdsgram() {
    if (!window.Adsgram || !CONFIG.ADSGRAM_BLOCK_ID) return;
    try {
      adsgramClicker = window.Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID });
    } catch (e) { console.warn("Adsgram init failed", e); }
  }

  async function showAdForCoins() {
    if (!CONFIG.ADSGRAM_BLOCK_ID || !adsgramClicker) {
      // тестовый режим без настроенного блока — просто выдаём награду
      await grantAdReward("coins");
      return;
    }
    try {
      await adsgramClicker.show();
      await grantAdReward("coins");
    } catch (err) {
      toast("Реклама не показана, попробуй позже");
    }
  }

  async function showAdForEnergy() {
    if (!CONFIG.ADSGRAM_BLOCK_ID || !adsgramClicker) {
      await grantAdReward("energy");
      return;
    }
    try {
      await adsgramClicker.show();
      await grantAdReward("energy");
    } catch (err) {
      toast("Реклама не показана, попробуй позже");
    }
  }

  async function grantAdReward(kind) {
    if (kind === "coins") {
      state.balance += CONFIG.AD_COIN_REWARD;
      toast(`+${CONFIG.AD_COIN_REWARD} стадсов за рекламу`);
    } else {
      state.energy = state.energyMax;
      toast("Энергия восстановлена полностью");
    }
    state.adsWatched = (state.adsWatched || 0) + 1;
    renderBalance();
    renderEnergy();
    persist();
    if (API.hasBackend) {
      try { const res = await API.claimAdReward(kind); applyServerState(res); }
      catch (err) { console.error(err); }
    }
  }

  // ---------- ЗАДАНИЯ ----------
  async function completeTask(id, url) {
    if (state.completedTasks.includes(id)) return;
    if (url) {
      if (tg?.openTelegramLink && url.includes("t.me")) tg.openTelegramLink(url);
      else window.open(url, "_blank");
    }
    const def = CONFIG.TASKS.find(t => t.id === id);
    // Награда выдаётся сразу в демо-режиме. Для продакшена стоит проверять
    // подписку через backend (Bot API getChatMember) перед начислением.
    state.completedTasks.push(id);
    state.balance += def.reward;
    renderBalance();
    renderTasks();
    toast(`+${formatNumber(def.reward)} стадсов`);
    persist();
    if (API.hasBackend) {
      try { const res = await API.completeTask(id); applyServerState(res); }
      catch (err) { console.error(err); }
    }
  }

  // ---------- НАВИГАЦИЯ ----------
  function switchScreen(name) {
    $$(".screen").forEach(s => s.classList.remove("active"));
    $(`#screen-${name}`).classList.add("active");
    $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.screen === name));
    haptic("light");
  }

  // ---------- ПРИВЯЗКА СОБЫТИЙ ----------
  function bindEvents() {
    $("#coinBtn").addEventListener("click", handleTap);

    $$(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => switchScreen(btn.dataset.screen));
    });

    $$(".shop-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".shop-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderShop();
      });
    });

    $("#shopList").addEventListener("click", (e) => {
      const btn = e.target.closest(".shop-item-buy");
      if (btn) buyUpgrade(btn.dataset.id, btn.dataset.cat);
    });

    $("#inviteBtn").addEventListener("click", openInvite);
    $("#copyLinkBtn").addEventListener("click", copyLink);

    $("#watchAdBtn").addEventListener("click", showAdForCoins);
    $("#watchAdEnergyBtn").addEventListener("click", showAdForEnergy);

    $("#taskList").addEventListener("click", (e) => {
      const btn = e.target.closest(".task-item-btn");
      if (btn && !btn.disabled) completeTask(btn.dataset.id, btn.dataset.url);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { state.lastSeen = Date.now(); persist(); }
    });
  }

  init();
})();
