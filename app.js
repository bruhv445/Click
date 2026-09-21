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
  let adsgramReward = null;       // Reward video ad — используется во всех кнопках "смотреть за награду"
  let adsgramInterstitial = null; // Interstitial — полноэкранная реклама без награды
  let lastInterstitialAt = 0;
  let adOfferTimer = null;
  let adOfferVisibleTimer = null;

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
    if (!state.pendingUpgrades) state.pendingUpgrades = {};
    if (!state.exchangeHistory) state.exchangeHistory = [];
    applyOfflineEarnings();
    renderProfile();
    renderBalance();
    renderEnergy();
    renderShop();
    renderTasks();
    renderBuffBanner();
    $("#adRobuxAmount").textContent = CONFIG.AD_ROBUX_REWARD;
    bindEvents();
    moveTabIndicator("clicker");
    startLoops();
    initAdsgram();
    startAutoBuffTimer();
    scheduleAdOffer();
  }

  function applyOfflineEarnings() {
    const now = Date.now();
    const last = state.lastSeen || now;
    const elapsedSec = Math.max(0, Math.floor((now - last) / 1000));
    // восстановление энергии за то время, пока не заходил
    const regen = Math.min(state.energyMax, state.energy + elapsedSec * CONFIG.ENERGY_REGEN_PER_SEC);
    state.energy = regen;
    state.lastSeen = now;
    // применяем прокачки, которые успели "дозреть", пока игрока не было
    checkPendingUpgrades(true);
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
    $("#levelBadge").textContent = level.level;
    $("#levelFill").style.width = level.progressPct + "%";
    $("#levelPercent").textContent = Math.floor(level.progressPct) + "%";
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
    $("#robuxBalance").textContent = formatNumber(state.robux || 0);
  }

  // ---------- БУСТ К КЛИКУ (x2/x3, множитель у каждого буста свой) ----------
  function isBuffActive() {
    return Date.now() < (state.buffUntil || 0);
  }

  function getClickMultiplier() {
    return isBuffActive() ? (state.buffMultiplier || CONFIG.BUFF_MULTIPLIER) : 1;
  }

  function activateBuff(multiplier, durationMs) {
    state.buffMultiplier = multiplier;
    state.buffUntil = Date.now() + durationMs;
    persist();
    renderBuffBanner();
  }

  function renderBuffBanner() {
    const banner = $("#buffBanner");
    const coinBtn = $("#coinBtn");
    if (isBuffActive()) {
      const secLeft = Math.ceil((state.buffUntil - Date.now()) / 1000);
      $("#buffMultiplierLabel").textContent = state.buffMultiplier || CONFIG.BUFF_MULTIPLIER;
      $("#buffTimer").textContent = Math.max(0, secLeft);
      banner.classList.add("show");
      coinBtn.classList.add("buffed");
    } else {
      banner.classList.remove("show");
      coinBtn.classList.remove("buffed");
    }
  }

  function startAutoBuffTimer() {
    setInterval(() => {
      activateBuff(CONFIG.BUFF_MULTIPLIER, CONFIG.AUTO_BUFF_DURATION_MS);
      toast(`🔥 x${CONFIG.BUFF_MULTIPLIER} к клику на ${CONFIG.AUTO_BUFF_DURATION_MS / 1000} сек — бесплатный бонус!`);
      haptic("medium");
    }, CONFIG.AUTO_BUFF_INTERVAL_MS);
  }

  // ---------- ВСПЛЫВАЮЩИЕ ПРЕДЛОЖЕНИЯ РЕКЛАМЫ (только на главном экране) ----------
  let currentAdOffer = null;

  function isClickerScreenActive() {
    return $("#screen-clicker")?.classList.contains("active");
  }

  function scheduleAdOffer() {
    clearTimeout(adOfferTimer);
    adOfferTimer = setTimeout(showAdOffer, CONFIG.AD_OFFER_INTERVAL_MS);
  }

  function showAdOffer() {
    if (document.hidden) { scheduleAdOffer(); return; }
    if (!isClickerScreenActive()) {
      // не на главном экране — пробуем ещё раз чуть позже, не сбивая общий 30-сек ритм
      adOfferTimer = setTimeout(showAdOffer, 5000);
      return;
    }
    currentAdOffer = CONFIG.AD_OFFERS[Math.floor(Math.random() * CONFIG.AD_OFFERS.length)];
    $("#adOfferIcon").textContent = currentAdOffer.icon;
    $("#adOfferTitle").textContent = currentAdOffer.title;
    $("#adOfferSub").textContent = currentAdOffer.sub;
    $("#adOfferPopup").classList.add("show");
    clearTimeout(adOfferVisibleTimer);
    adOfferVisibleTimer = setTimeout(hideAdOffer, CONFIG.AD_OFFER_VISIBLE_MS);
  }

  function hideAdOffer() {
    $("#adOfferPopup").classList.remove("show");
    clearTimeout(adOfferVisibleTimer);
    scheduleAdOffer();
  }

  async function claimAdOffer() {
    const offer = currentAdOffer;
    hideAdOffer();
    if (!offer) return;

    function grant() {
      if (offer.kind === "buff") {
        activateBuff(offer.multiplier, offer.durationMs);
        toast(`⚡ x${offer.multiplier} к клику на ${offer.durationMs / 1000} сек!`);
      } else if (offer.kind === "robux") {
        state.robux = (state.robux || 0) + offer.amount;
        renderBalance();
        persist();
        toast(`💎 +${formatNumber(offer.amount)} ${CONFIG.ROBUX_NAME} за рекламу!`);
      } else {
        state.balance += offer.amount;
        renderBalance();
        persist();
        toast(`💰 +${formatNumber(offer.amount)} стадсов за рекламу!`);
      }
      haptic("medium");
    }

    if (!CONFIG.ADSGRAM_REWARD_BLOCK_ID || !adsgramReward) {
      grant();
      return;
    }
    try {
      await adsgramReward.show();
      grant();
    } catch (err) {
      toast("Реклама не показана, попробуй позже");
    }
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
    const container = $("#shopList");
    container.innerHTML = "";

    if (activeCat === "robux") {
      renderExchange(container);
      return;
    }

    CONFIG.CLICK_UPGRADES.forEach((def) => {
      const level = state.upgrades[def.id] || 0;
      const cost = upgradeCost(def, level);
      const affordable = state.balance >= cost;
      const pendingUntil = state.pendingUpgrades[def.id];
      const isPending = pendingUntil && pendingUntil > Date.now();

      const card = document.createElement("div");
      card.className = "shop-item" + (isPending ? " pending" : affordable ? "" : " disabled");

      if (isPending) {
        const totalMs = CONFIG.UPGRADE_DELAY_MS;
        const leftMs = Math.max(0, pendingUntil - Date.now());
        const pct = Math.min(100, 100 - (leftMs / totalMs) * 100);
        card.innerHTML = `
          <div class="shop-item-icon">⏳</div>
          <div class="shop-item-info">
            <div class="shop-item-name">${def.name}</div>
            <div class="shop-item-sub">Прокачивается… осталось ${formatTime(leftMs)}</div>
            <div class="upgrade-progress"><div class="upgrade-progress-fill" style="width:${pct}%"></div></div>
          </div>
          <button class="shop-item-speedup" data-id="${def.id}">⚡ Ускорить</button>
        `;
      } else {
        card.innerHTML = `
          <div class="shop-item-icon">👆</div>
          <div class="shop-item-info">
            <div class="shop-item-name">${def.name}</div>
            <div class="shop-item-sub">Ур. ${level} · +${def.effect}/тап</div>
          </div>
          <button class="shop-item-buy" data-id="${def.id}" data-cat="click">
            <img src="изображения/coin.svg" class="coin-icon-sm" alt="">${formatNumber(cost)}
          </button>
        `;
      }
      container.appendChild(card);
    });
  }

  function formatTime(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s} сек`;
  }

  // ---------- ОБМЕН СТАДСОВ НА РОБУКСЫ ----------
  function renderExchange(container) {
    const rate = CONFIG.ROBUX_EXCHANGE_RATE;
    const minRobux = CONFIG.ROBUX_EXCHANGE_MIN;
    const minAmount = minRobux * rate;
    const card = document.createElement("div");
    card.className = "exchange-card";
    card.innerHTML = `
      <div class="exchange-icon-big"><img src="изображения/robux.svg" alt=""></div>
      <div class="exchange-rate">${formatNumber(rate)} стадсов = 1 ${CONFIG.ROBUX_NAME.replace(/ов$/, "")}</div>
      <div class="exchange-note">Минимум за раз — ${formatNumber(minRobux)} ${CONFIG.ROBUX_NAME}</div>

      <div class="exchange-input-row">
        <span class="exchange-input-label">👤</span>
        <input id="exchangeNick" class="exchange-input" type="text" maxlength="24"
               placeholder="Твой ник для истории обменов">
      </div>

      <div class="exchange-input-row">
        <img src="изображения/coin.svg" class="coin-icon-sm" alt="">
        <input id="exchangeAmount" class="exchange-input" type="number" inputmode="numeric"
               min="0" step="1" placeholder="Сколько стадсов обменять">
        <button id="exchangeMaxBtn" class="exchange-max-btn">MAX</button>
      </div>

      <div class="exchange-preview">
        Получишь: <img src="изображения/robux.svg" class="coin-icon-sm" alt=""><b id="exchangePreview">0</b> ${CONFIG.ROBUX_NAME}
      </div>

      <button id="exchangeConfirmBtn" class="exchange-confirm-btn" disabled>Обменять</button>

      <div class="exchange-history">
        <div class="exchange-history-title">История обменов</div>
        <div id="exchangeHistoryList" class="exchange-history-list"></div>
      </div>
    `;
    container.appendChild(card);

    const nickInput = card.querySelector("#exchangeNick");
    const input = card.querySelector("#exchangeAmount");
    const preview = card.querySelector("#exchangePreview");
    const confirmBtn = card.querySelector("#exchangeConfirmBtn");
    const historyList = card.querySelector("#exchangeHistoryList");

    // подставляем последний использованный ник, чтобы не вводить каждый раз заново
    if (state.lastExchangeNick) nickInput.value = state.lastExchangeNick;

    function renderHistory() {
      const items = state.exchangeHistory || [];
      if (!items.length) {
        historyList.innerHTML = `<div class="exchange-history-empty">Пока нет обменов</div>`;
        return;
      }
      historyList.innerHTML = items.slice().reverse().slice(0, 20).map(h => {
        const d = new Date(h.ts);
        const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        return `
          <div class="exchange-history-item">
            <span class="exchange-history-nick">${escapeHtml(h.nickname)}</span>
            <span class="exchange-history-amounts">
              ${formatNumber(h.amount)} <img src="изображения/coin.svg" class="coin-icon-xs" alt=""> →
              ${formatNumber(h.robux)} <img src="изображения/robux.svg" class="coin-icon-xs" alt="">
            </span>
            <span class="exchange-history-time">${time}</span>
          </div>
        `;
      }).join("");
    }

    function updatePreview() {
      const amount = Math.max(0, Math.floor(Number(input.value) || 0));
      const robuxGain = Math.floor(amount / rate);
      preview.textContent = formatNumber(robuxGain);
      const nickOk = nickInput.value.trim().length > 0;
      confirmBtn.disabled = !(robuxGain >= minRobux && amount <= state.balance && nickOk);
    }

    input.addEventListener("input", updatePreview);
    nickInput.addEventListener("input", updatePreview);
    card.querySelector("#exchangeMaxBtn").addEventListener("click", () => {
      input.value = Math.floor(state.balance);
      updatePreview();
    });
    confirmBtn.addEventListener("click", () => {
      const nickname = nickInput.value.trim();
      const amount = Math.max(0, Math.floor(Number(input.value) || 0));
      const robuxGain = Math.floor(amount / rate);
      if (!nickname || robuxGain < minRobux || amount > state.balance) return;

      state.balance -= amount;
      state.robux = (state.robux || 0) + robuxGain;
      state.lastExchangeNick = nickname;
      state.exchangeHistory = state.exchangeHistory || [];
      state.exchangeHistory.push({ nickname, amount, robux: robuxGain, ts: Date.now() });

      renderBalance();
      renderShop();
      haptic("medium");
      toast(`+${formatNumber(robuxGain)} ${CONFIG.ROBUX_NAME}!`);
      persist();
    });

    updatePreview();
    renderHistory();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- ПРОМОКОДЫ ----------
  // Тот же алгоритм хеша, что и в config.js — так введённый код сравнивается
  // с сохранённым хешем, а не с открытым текстом.
  function hashPromo(str) {
    str = (str || "").trim().toLowerCase().replace(/^#/, "");
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return h;
  }

  function redeemPromo() {
    const input = $("#promoInput");
    if (!input) return;
    const raw = input.value;
    if (!raw || !raw.trim()) { toast("Введи промокод"); return; }

    const hash = hashPromo(raw);
    const found = CONFIG.PROMO_CODES.find(p => p.hash === hash);
    if (!found) { toast("Такого промокода не существует"); haptic("light"); return; }

    state.usedPromoCodes = state.usedPromoCodes || [];
    if (state.usedPromoCodes.includes(hash)) { toast("Этот промокод уже активирован"); return; }

    if (found.reward.type === "coins") {
      state.balance += found.reward.amount;
      toast(`🎁 +${formatNumber(found.reward.amount)} стадсов по промокоду!`);
    } else if (found.reward.type === "robux") {
      state.robux = (state.robux || 0) + found.reward.amount;
      toast(`🎁 +${formatNumber(found.reward.amount)} ${CONFIG.ROBUX_NAME} по промокоду!`);
    }

    state.usedPromoCodes.push(hash);
    renderBalance();
    haptic("medium");
    input.value = "";
    persist();
  }

  function renderTasks() {
    const section = $("#tasksSection");
    if (!CONFIG.TASKS.length) { section?.classList.add("hidden"); return; }
    section?.classList.remove("hidden");
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
    const gain = state.perClick * getClickMultiplier();
    state.energy -= CONFIG.ENERGY_COST_PER_TAP;
    state.balance += gain;
    pendingTaps += 1;

    renderBalance();
    renderEnergy();
    spawnFloatingGain(e, gain);
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

    spawnSparkles(stage, x, y);

    const btn = $("#coinBtn");
    btn.classList.remove("bump");
    void btn.offsetWidth;
    btn.classList.add("bump");
  }

  function spawnSparkles(stage, x, y) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const s = document.createElement("div");
      s.className = "sparkle";
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const dist = 30 + Math.random() * 25;
      s.style.left = x + "px";
      s.style.top = y + "px";
      s.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      s.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      stage.appendChild(s);
      setTimeout(() => s.remove(), 650);
    }
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

  // ---------- ФОНОВЫЕ ТИКИ (раз в секунду) ----------
  function startLoops() {
    setInterval(() => {
      if (state.energy < state.energyMax) {
        state.energy = Math.min(state.energyMax, state.energy + CONFIG.ENERGY_REGEN_PER_SEC);
        renderEnergy();
      }
      renderBuffBanner();
      // если открыт магазин с апгрейдами за тап — обновляем таймеры прокачки
      if ($(".shop-tab.active")?.dataset.cat === "click" && $("#screen-shop")?.classList.contains("active")) {
        renderShop();
      }
      checkPendingUpgrades(false);
    }, 1000);

    setInterval(() => { state.lastSeen = Date.now(); persist(); }, 5000);
  }

  // ---------- МАГАЗИН: ПОКУПКА (с прокачкой во времени) ----------
  async function buyUpgrade(id) {
    const def = CONFIG.CLICK_UPGRADES.find(u => u.id === id);
    if (!def) return;
    if (state.pendingUpgrades[id]) { toast("Этот апгрейд уже качается"); return; }
    const level = state.upgrades[id] || 0;
    const cost = upgradeCost(def, level);
    if (state.balance < cost) { toast("Недостаточно стадсов"); return; }

    state.balance -= cost;
    state.pendingUpgrades[id] = Date.now() + CONFIG.UPGRADE_DELAY_MS;

    renderBalance();
    renderShop();
    haptic("medium");
    toast(`Прокачка началась — ${formatTime(CONFIG.UPGRADE_DELAY_MS)}, или ускорь рекламой`);
    persist();

    if (API.hasBackend) {
      try {
        const res = await API.buyUpgrade(id);
        applyServerState(res);
      } catch (err) { console.error(err); }
    }
  }

  // Применяет эффект апгрейда, когда он "дозрел"
  function completeUpgrade(id) {
    const def = CONFIG.CLICK_UPGRADES.find(u => u.id === id);
    if (!def) return;
    delete state.pendingUpgrades[id];
    state.upgrades[id] = (state.upgrades[id] || 0) + 1;
    state.perClick += def.effect;
    persist();
  }

  // Проверяет все прокачки и завершает те, что готовы. silent=true — без тоста (например, при заходе в игру)
  function checkPendingUpgrades(silent) {
    const now = Date.now();
    let changed = false;
    Object.keys(state.pendingUpgrades || {}).forEach((id) => {
      if (state.pendingUpgrades[id] <= now) {
        const def = CONFIG.CLICK_UPGRADES.find(u => u.id === id);
        completeUpgrade(id);
        changed = true;
        if (!silent && def) toast(`✅ ${def.name} прокачан!`);
      }
    });
    if (changed) { renderShop(); renderBalance(); }
    return changed;
  }

  // Мгновенно завершает прокачку за просмотр рекламы
  async function speedUpUpgrade(id) {
    if (!state.pendingUpgrades[id]) return;
    async function finish() {
      completeUpgrade(id);
      renderShop();
      renderBalance();
      haptic("medium");
      toast("⚡ Прокачка ускорена!");
    }
    if (!CONFIG.ADSGRAM_REWARD_BLOCK_ID || !adsgramReward) {
      await finish();
      return;
    }
    try {
      await adsgramReward.show();
      await finish();
    } catch (err) {
      toast("Реклама не показана, попробуй позже");
    }
  }

  // ---------- РЕКЛАМА (AdsGram: Reward + Interstitial + Task) ----------
  function initAdsgram() {
    if (!window.Adsgram) return;

    if (CONFIG.ADSGRAM_REWARD_BLOCK_ID) {
      try {
        adsgramReward = window.Adsgram.init({ blockId: CONFIG.ADSGRAM_REWARD_BLOCK_ID });
      } catch (e) { console.warn("Adsgram reward init failed", e); }
    }

    if (CONFIG.ADSGRAM_INTERSTITIAL_BLOCK_ID) {
      try {
        adsgramInterstitial = window.Adsgram.init({ blockId: CONFIG.ADSGRAM_INTERSTITIAL_BLOCK_ID });
      } catch (e) { console.warn("Adsgram interstitial init failed", e); }
    }

    initAdsgramTask();
  }

  // Показывает полноэкранную рекламу без награды (доп. доход, не чаще раза в INTERSTITIAL_MIN_INTERVAL_MS)
  function showInterstitial() {
    if (!adsgramInterstitial) return;
    if (Date.now() - lastInterstitialAt < CONFIG.INTERSTITIAL_MIN_INTERVAL_MS) return;
    lastInterstitialAt = Date.now();
    adsgramInterstitial.show().catch(() => { /* пользователь закрыл/ошибка — просто игнорируем */ });
  }

  // Виджет "рекламные задания" AdsGram — сам показывает доступные задания и выдаёт событие reward
  function initAdsgramTask() {
    if (!CONFIG.ADSGRAM_TASK_BLOCK_ID) return;
    const el = $("#adsgramTask");
    if (!el) return;
    el.setAttribute("data-block-id", CONFIG.ADSGRAM_TASK_BLOCK_ID);
    el.addEventListener("reward", () => {
      state.balance += CONFIG.AD_TASK_REWARD;
      state.adsWatched = (state.adsWatched || 0) + 1;
      renderBalance();
      haptic("medium");
      toast(`+${formatNumber(CONFIG.AD_TASK_REWARD)} стадсов за рекламное задание!`);
      persist();
    });
    el.addEventListener("onBannerNotFound", () => {
      $("#adsgramTaskWrap")?.classList.add("hidden");
    });
    el.addEventListener("onError", () => {
      console.warn("Adsgram task widget error");
    });
  }

  async function showAdForCoins() {
    if (!CONFIG.ADSGRAM_REWARD_BLOCK_ID || !adsgramReward) {
      // тестовый режим без настроенного блока — просто выдаём награду
      await grantAdReward("coins");
      return;
    }
    try {
      await adsgramReward.show();
      await grantAdReward("coins");
    } catch (err) {
      toast("Реклама не показана, попробуй позже");
    }
  }

  async function showAdForEnergy() {
    if (!CONFIG.ADSGRAM_REWARD_BLOCK_ID || !adsgramReward) {
      await grantAdReward("energy");
      return;
    }
    try {
      await adsgramReward.show();
      await grantAdReward("energy");
    } catch (err) {
      toast("Реклама не показана, попробуй позже");
    }
  }

  async function showAdForRobux() {
    if (!CONFIG.ADSGRAM_REWARD_BLOCK_ID || !adsgramReward) {
      await grantAdReward("robux");
      return;
    }
    try {
      await adsgramReward.show();
      await grantAdReward("robux");
    } catch (err) {
      toast("Реклама не показана, попробуй позже");
    }
  }

  async function grantAdReward(kind) {
    if (kind === "coins") {
      state.balance += CONFIG.AD_COIN_REWARD;
      toast(`+${CONFIG.AD_COIN_REWARD} стадсов за рекламу`);
    } else if (kind === "robux") {
      state.robux = (state.robux || 0) + CONFIG.AD_ROBUX_REWARD;
      toast(`+${CONFIG.AD_ROBUX_REWARD} ${CONFIG.ROBUX_NAME} за рекламу`);
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
    moveTabIndicator(name);
    haptic("light");
    // показываем interstitial-рекламу на переходах между вкладками, кроме возврата в кликер,
    // чтобы не мешать самому тапу
    if (name !== "clicker") showInterstitial();
  }

  function moveTabIndicator(name) {
    const tabs = $$(".tab-btn");
    const indicator = $("#tabIndicator");
    if (!indicator || !tabs.length) return;
    const idx = Math.max(0, tabs.findIndex(b => b.dataset.screen === name));
    indicator.style.transform = `translateX(${idx * 100}%)`;
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
      const buyBtn = e.target.closest(".shop-item-buy");
      if (buyBtn) { buyUpgrade(buyBtn.dataset.id); return; }
      const speedBtn = e.target.closest(".shop-item-speedup");
      if (speedBtn) { speedUpUpgrade(speedBtn.dataset.id); return; }
    });

    $("#watchAdBtn").addEventListener("click", showAdForCoins);
    $("#watchAdEnergyBtn").addEventListener("click", showAdForEnergy);
    $("#watchAdRobuxBtn").addEventListener("click", showAdForRobux);

    $("#adOfferWatch").addEventListener("click", claimAdOffer);
    $("#adOfferClose").addEventListener("click", hideAdOffer);

    $("#promoBtn").addEventListener("click", redeemPromo);
    $("#promoInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") redeemPromo();
    });

    $("#privacyLinkBtn").addEventListener("click", () => $("#privacyModal").classList.add("show"));
    $("#privacyModalClose").addEventListener("click", () => $("#privacyModal").classList.remove("show"));
    $("#privacyModal").addEventListener("click", (e) => {
      if (e.target.id === "privacyModal") $("#privacyModal").classList.remove("show");
    });

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
