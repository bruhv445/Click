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
  // Отсчитываем "период тишины" от момента открытия игры, а не от нуля —
  // иначе самый первый переход между вкладками сразу же показывал бы рекламу.
  let lastInterstitialAt = Date.now();
  let adOfferTimer = null;
  let adOfferVisibleTimer = null;
  let wheelRotation = 0;         // накопленный угол поворота колеса (визуальный, не хранится)
  let wheelSegments = [];
  let wheelSpinning = false;
  let wheelCountdownTimer = null;
  const WHEEL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const WHEEL_COLORS = ["#ff3b30", "#ff9466", "#a259ff", "#00c2ff", "#37f28f", "#ffe14d", "#ff3fa4", "#7df3ff"];

  // ---------- КОМБО (фирменная механика тапа) ----------
  let comboCount = 0;
  let lastTapAt = 0;
  let comboResetTimer = null;

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
    if (!state.totalTaps) state.totalTaps = 0;
    if (!state.totalUpgradesBought) state.totalUpgradesBought = 0;
    if (!state.wheelSpins) state.wheelSpins = 0;
    if (!state.lastWheelSpin) state.lastWheelSpin = 0;
    if (!state.lastAdWheelSpin) state.lastAdWheelSpin = 0;
    if (!state.claimedAchievements) state.claimedAchievements = [];
    if (!state.maxCombo) state.maxCombo = 0;
    if (!state.passXp) state.passXp = 0;
    if (!state.claimedFreeLevels) state.claimedFreeLevels = [];
    if (!state.claimedPremiumLevels) state.claimedPremiumLevels = [];
    if (typeof state.premiumUnlocked !== "boolean") state.premiumUnlocked = false;
    if (!state.premiumAdsWatched) state.premiumAdsWatched = 0;
    if (typeof state.bossIndex !== "number") state.bossIndex = 0;
    if (state.bossHp === undefined) state.bossHp = null;
    if (!state.defeatedBosses) state.defeatedBosses = [];
    if (!state.claimedQuestsToday) state.claimedQuestsToday = {};
    if (!state.dailyProgress) state.dailyProgress = { day: "", tapsToday: 0, upgradesBoughtToday: 0, upgradesCompletedToday: 0, wheelToday: 0 };
    applyOfflineEarnings();
    renderProfile();
    renderBalance();
    renderEnergy();
    renderShop();
    renderTasks();
    renderBuffBanner();
    renderGoals();
    renderQuests();
    ensureBossHpInit();
    renderBossBanner();
    renderBosses();
    renderPass();
    updateWheelBadge();
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
            <img src="img/coin.svg" class="coin-icon-sm" alt="">${formatNumber(cost)}
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

  // Для длинных отсчётов (часы) — например, кулдаун колеса удачи
  function formatHMS(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ---------- ОБМЕН СТАДСОВ НА РОБУКСЫ ----------
  function renderExchange(container) {
    const rate = CONFIG.ROBUX_EXCHANGE_RATE;
    const minRobux = CONFIG.ROBUX_EXCHANGE_MIN;
    const minAmount = minRobux * rate;
    const card = document.createElement("div");
    card.className = "exchange-card";
    card.innerHTML = `
      <div class="exchange-icon-big"><img src="img/robux.svg" alt=""></div>
      <div class="exchange-rate">${formatNumber(rate)} стадсов = 1 ${CONFIG.ROBUX_NAME.replace(/ов$/, "")}</div>
      <div class="exchange-note">Минимум за раз — ${formatNumber(minRobux)} ${CONFIG.ROBUX_NAME}</div>

      <div class="exchange-input-row">
        <span class="exchange-input-label">👤</span>
        <input id="exchangeNick" class="exchange-input" type="text" maxlength="24"
               placeholder="Твой ник для истории обменов">
      </div>

      <div class="exchange-input-row">
        <img src="img/coin.svg" class="coin-icon-sm" alt="">
        <input id="exchangeAmount" class="exchange-input" type="number" inputmode="numeric"
               min="0" step="1" placeholder="Сколько стадсов обменять">
        <button id="exchangeMaxBtn" class="exchange-max-btn">MAX</button>
      </div>

      <div class="exchange-preview">
        Получишь: <img src="img/robux.svg" class="coin-icon-sm" alt=""><b id="exchangePreview">0</b> ${CONFIG.ROBUX_NAME}
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
              ${formatNumber(h.amount)} <img src="img/coin.svg" class="coin-icon-xs" alt=""> →
              ${formatNumber(h.robux)} <img src="img/robux.svg" class="coin-icon-xs" alt="">
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

  // ---------- КОМБО: быстрые тапы подряд наращивают временный множитель ----------
  function getComboTier(count) {
    let tier = CONFIG.COMBO_TIERS[0];
    for (const t of CONFIG.COMBO_TIERS) if (count >= t.taps) tier = t;
    return tier;
  }

  function bumpCombo() {
    const now = Date.now();
    comboCount = (now - lastTapAt <= CONFIG.COMBO_WINDOW_MS) ? comboCount + 1 : 1;
    lastTapAt = now;
    if (comboCount > (state.maxCombo || 0)) state.maxCombo = comboCount;
    clearTimeout(comboResetTimer);
    comboResetTimer = setTimeout(() => { comboCount = 0; renderCombo(); }, CONFIG.COMBO_WINDOW_MS);
    renderCombo();
    return getComboTier(comboCount);
  }

  function renderCombo() {
    const el = $("#comboMeter");
    if (!el) return;
    const firstTier = CONFIG.COMBO_TIERS[1];
    if (!firstTier || comboCount < firstTier.taps) { el.classList.remove("show"); return; }
    const tier = getComboTier(comboCount);
    el.classList.add("show");
    $("#comboLabel").textContent = tier.label;
    $("#comboCount").textContent = comboCount;
  }

  // ---------- ТАПЫ ПО МОНЕТЕ ----------
  function handleTap(e) {
    if (state.energy < CONFIG.ENERGY_COST_PER_TAP) {
      toast("Энергия закончилась — жди восстановления или смотри рекламу");
      return;
    }
    const comboTier = bumpCombo();
    const isCrit = Math.random() < CONFIG.CRIT_CHANCE;
    const critMult = isCrit ? CONFIG.CRIT_MULTIPLIER : 1;
    const gain = Math.round(state.perClick * getClickMultiplier() * comboTier.mult * critMult);

    state.energy -= CONFIG.ENERGY_COST_PER_TAP;
    state.balance += gain;
    state.totalTaps = (state.totalTaps || 0) + 1;
    bumpDaily("tapsToday");
    pendingTaps += 1;
    state.passXp = (state.passXp || 0) + 1;
    renderPassSummary();
    damageBoss(gain);

    renderBalance();
    renderEnergy();
    spawnFloatingGain(e, gain, isCrit);
    if (isCrit) triggerCritFlash();
    haptic(isCrit ? "heavy" : "light");
    schedulePersist();
    scheduleSync();
  }

  function triggerCritFlash() {
    const el = $("#critFlash");
    if (!el) return;
    el.classList.remove("active");
    void el.offsetWidth;
    el.classList.add("active");
  }

  function spawnFloatingGain(e, amount, isCrit) {
    const stage = $(".coin-stage");
    const rect = stage.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    const x = (point.clientX ?? rect.width / 2) - rect.left;
    const y = (point.clientY ?? rect.height / 2) - rect.top;

    const el = document.createElement("div");
    el.className = "floating-gain" + (isCrit ? " crit" : "");
    el.textContent = (isCrit ? "КРИТ! +" : "+") + formatNumber(amount);
    el.style.left = x + "px";
    el.style.top = y + "px";
    stage.appendChild(el);
    setTimeout(() => el.remove(), isCrit ? 1100 : 900);

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
      updateWheelBadge();
      // если открыт магазин с апгрейдами за тап — обновляем таймеры прокачки
      if ($(".shop-tab.active")?.dataset.cat === "click" && $("#screen-shop")?.classList.contains("active")) {
        renderShop();
      }
      if ($("#screen-goals")?.classList.contains("active")) renderGoals();
      if ($("#passModal")?.classList.contains("show")) { renderQuests(); renderPass(); }
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
    bumpDaily("upgradesBoughtToday");

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
    state.totalUpgradesBought = (state.totalUpgradesBought || 0) + 1;
    bumpDaily("upgradesCompletedToday");
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

  // ---------- КОЛЕСО УДАЧИ (бесплатная механика, не завязанная на рекламу) ----------
  function isWheelAvailable() {
    return !state.lastWheelSpin || (Date.now() - state.lastWheelSpin >= WHEEL_COOLDOWN_MS);
  }

  function updateWheelBadge() {
    const badge = $("#wheelOpenBadge");
    if (badge) badge.classList.toggle("hidden", !isWheelAvailable());
  }

  function buildWheelSegments() {
    const rewards = CONFIG.WHEEL_REWARDS;
    const totalWeight = rewards.reduce((s, r) => s + r.weight, 0);
    let angle = 0;
    return rewards.map((reward, i) => {
      const span = (reward.weight / totalWeight) * 360;
      const seg = {
        reward,
        color: WHEEL_COLORS[i % WHEEL_COLORS.length],
        startAngle: angle,
        endAngle: angle + span,
        midAngle: angle + span / 2,
      };
      angle += span;
      return seg;
    });
  }

  // угол 0 = верх циферблата, дальше по часовой стрелке (совпадает с CSS-поворотом)
  function wheelPolar(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  }

  function renderWheelDial() {
    wheelSegments = buildWheelSegments();
    const dial = $("#wheelDial");
    if (!dial) return;
    const cx = 110, cy = 110, r = 106;

    let svg = `<defs>
      <radialGradient id="wheelSheen" cx="32%" cy="24%" r="75%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.4"/>
        <stop offset="55%" stop-color="#ffffff" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>`;

    wheelSegments.forEach((s) => {
      const p0 = wheelPolar(cx, cy, r, s.startAngle);
      const p1 = wheelPolar(cx, cy, r, s.endAngle);
      const largeArc = s.endAngle - s.startAngle > 180 ? 1 : 0;
      svg += `<path d="M ${cx},${cy} L ${p0.x.toFixed(2)},${p0.y.toFixed(2)} A ${r},${r} 0 ${largeArc} 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)} Z" fill="${s.color}" stroke="rgba(10,10,18,0.55)" stroke-width="2"/>`;
    });

    wheelSegments.forEach((s) => {
      const lp = wheelPolar(cx, cy, r * 0.64, s.midAngle);
      svg += `<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" font-size="22" text-anchor="middle" dominant-baseline="central">${s.reward.icon}</text>`;
    });

    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#wheelSheen)"/>`;

    dial.innerHTML = svg;
    dial.style.transform = `rotate(${wheelRotation}deg)`;
  }

  // ---------- ОБЩИЕ НАГРАДЫ (колесо, баттл-пасс, боссы) ----------
  function rewardLabel(reward) {
    if (!reward) return "";
    if (reward.type === "coins") return `+${formatNumber(reward.amount)} стадсов`;
    if (reward.type === "robux") return `+${reward.amount} ${CONFIG.ROBUX_NAME}`;
    if (reward.type === "buff") return `x${reward.multiplier} к клику на ${reward.durationMs / 1000} сек`;
    if (reward.type === "wheelToken") return "Доп. спин колеса удачи";
    if (reward.type === "bundle") return `+${formatNumber(reward.coins)} стадсов и +${reward.robux} ${CONFIG.ROBUX_NAME}`;
    return "";
  }

  function rewardIcon(reward) {
    if (!reward) return "🎁";
    if (reward.type === "coins") return "💰";
    if (reward.type === "robux") return "🔷";
    if (reward.type === "buff") return "⚡";
    if (reward.type === "wheelToken") return "🎡";
    if (reward.type === "bundle") return "🎁";
    return "🎁";
  }

  function grantReward(reward) {
    if (!reward) return;
    if (reward.type === "coins") state.balance += reward.amount;
    else if (reward.type === "robux") state.robux = (state.robux || 0) + reward.amount;
    else if (reward.type === "buff") activateBuff(reward.multiplier, reward.durationMs);
    else if (reward.type === "wheelToken") { state.lastAdWheelSpin = 0; updateWheelBadge(); }
    else if (reward.type === "bundle") {
      state.balance += reward.coins || 0;
      state.robux = (state.robux || 0) + (reward.robux || 0);
    }
    renderBalance();
  }

  function pickWeightedWheelIndex() {
    const totalWeight = wheelSegments.reduce((s, seg) => s + seg.reward.weight, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < wheelSegments.length; i++) {
      r -= wheelSegments[i].reward.weight;
      if (r <= 0) return i;
    }
    return wheelSegments.length - 1;
  }

  function isAdSpinAvailable() {
    return Date.now() - (state.lastAdWheelSpin || 0) >= CONFIG.WHEEL_AD_SPIN_COOLDOWN_MS;
  }

  function updateWheelModalState() {
    const spinBtn = $("#wheelSpinBtn");
    const sub = $("#wheelModalSub");
    const countdown = $("#wheelCountdown");
    const adBtn = $("#wheelAdSpinBtn");
    const adCountdown = $("#wheelAdCountdown");
    if (!spinBtn) return;

    if (isWheelAvailable()) {
      spinBtn.disabled = wheelSpinning;
      spinBtn.textContent = wheelSpinning ? "Крутится…" : "Крутить бесплатно";
      sub.textContent = "Один бесплатный спин в сутки — без рекламы";
      countdown.classList.add("hidden");
    } else {
      spinBtn.disabled = true;
      spinBtn.textContent = "Бесплатный спин использован";
      sub.textContent = "Следующий бесплатный спин через:";
      countdown.classList.remove("hidden");
      const leftMs = Math.max(0, WHEEL_COOLDOWN_MS - (Date.now() - state.lastWheelSpin));
      countdown.textContent = formatHMS(leftMs);
      if (leftMs <= 0) updateWheelBadge();
    }

    if (adBtn) {
      const adReady = isAdSpinAvailable() && !wheelSpinning;
      adBtn.disabled = !adReady;
      adBtn.querySelector("span").textContent = wheelSpinning ? "Крутится…" : "🎬 Ещё спин за рекламу";
      if (adReady || wheelSpinning) {
        adCountdown.classList.add("hidden");
      } else {
        adCountdown.classList.remove("hidden");
        const leftMs = Math.max(0, CONFIG.WHEEL_AD_SPIN_COOLDOWN_MS - (Date.now() - (state.lastAdWheelSpin || 0)));
        adCountdown.textContent = "Доступно через " + formatTime(leftMs);
      }
    }
  }

  function openWheelModal() {
    renderWheelDial();
    updateWheelModalState();
    $("#wheelModal").classList.add("show");
    haptic("light");
    clearInterval(wheelCountdownTimer);
    wheelCountdownTimer = setInterval(updateWheelModalState, 1000);
  }

  function closeWheelModal() {
    $("#wheelModal").classList.remove("show");
    clearInterval(wheelCountdownTimer);
  }

  function spinWheel(fromAd) {
    if (wheelSpinning) return;
    if (fromAd ? !isAdSpinAvailable() : !isWheelAvailable()) return;
    wheelSpinning = true;
    updateWheelModalState();

    const targetIndex = pickWeightedWheelIndex();
    const seg = wheelSegments[targetIndex];
    const targetMod = ((-seg.midAngle % 360) + 360) % 360;
    const currentMod = ((wheelRotation % 360) + 360) % 360;
    const diff = ((targetMod - currentMod) + 360) % 360;
    wheelRotation += 5 * 360 + diff;

    const dial = $("#wheelDial");
    dial.style.transform = `rotate(${wheelRotation}deg)`;
    haptic("medium");

    setTimeout(() => {
      wheelSpinning = false;
      if (fromAd) state.lastAdWheelSpin = Date.now();
      else state.lastWheelSpin = Date.now();
      state.wheelSpins = (state.wheelSpins || 0) + 1;
      bumpDaily("wheelToday");

      const reward = seg.reward;
      grantReward(reward);

      toast(`${reward.icon} ${rewardLabel(reward)}!`);
      haptic("heavy");
      persist();
      renderGoals();
      renderQuests();
      updateWheelModalState();
      updateWheelBadge();
    }, 3200);
  }

  async function spinWheelViaAd() {
    if (wheelSpinning || !isAdSpinAvailable()) return;
    if (!CONFIG.ADSGRAM_REWARD_BLOCK_ID || !adsgramReward) {
      spinWheel(true);
      return;
    }
    try {
      await adsgramReward.show();
      spinWheel(true);
    } catch (err) {
      toast("Реклама не показана, попробуй позже");
    }
  }

  // ---------- ДОСТИЖЕНИЯ (реальный игровой прогресс, не завязан на рекламу) ----------
  function getAchievementValue(type) {
    switch (type) {
      case "taps": return state.totalTaps || 0;
      case "upgrades": return state.totalUpgradesBought || 0;
      case "exchange": return (state.exchangeHistory || []).length;
      case "wheel": return state.wheelSpins || 0;
      case "combo": return state.maxCombo || 0;
      case "level": return levelFromBalance(state.balance).level;
      default: return 0;
    }
  }

  function renderGoals() {
    const container = $("#goalsList");
    if (!container) return;
    container.innerHTML = CONFIG.ACHIEVEMENTS.map(a => {
      const value = getAchievementValue(a.type);
      const claimed = (state.claimedAchievements || []).includes(a.id);
      const ready = !claimed && value >= a.threshold;
      const pct = Math.min(100, (value / a.threshold) * 100);
      const rewardText = a.reward.type === "coins"
        ? `+${formatNumber(a.reward.amount)} стадсов`
        : `+${a.reward.amount} ${CONFIG.ROBUX_NAME}`;
      return `
        <div class="goal-item ${claimed ? "done" : ""}">
          <div class="goal-item-icon">${a.icon}</div>
          <div class="goal-item-info">
            <div class="goal-item-title">${a.title}</div>
            <div class="goal-item-desc">${a.desc} · ${rewardText}</div>
            ${claimed ? "" : `
              <div class="goal-item-progress-bar"><div class="goal-item-progress-fill" style="width:${pct}%"></div></div>
              <div class="goal-item-progress-text">${formatNumber(Math.min(value, a.threshold))} / ${formatNumber(a.threshold)}</div>
            `}
          </div>
          <button class="goal-item-claim ${claimed ? "claimed" : ""}" data-id="${a.id}" ${claimed || !ready ? "disabled" : ""}>
            ${claimed ? "✓" : ready ? "Забрать" : "🔒"}
          </button>
        </div>
      `;
    }).join("");
  }

  function claimAchievement(id) {
    const a = CONFIG.ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return;
    state.claimedAchievements = state.claimedAchievements || [];
    if (state.claimedAchievements.includes(id)) return;
    const value = getAchievementValue(a.type);
    if (value < a.threshold) return;

    if (a.reward.type === "coins") state.balance += a.reward.amount;
    else if (a.reward.type === "robux") state.robux = (state.robux || 0) + a.reward.amount;

    state.claimedAchievements.push(id);
    renderBalance();
    renderGoals();
    haptic("heavy");
    toast(`🏆 ${a.title} — награда получена!`);
    persist();
  }

  // ---------- ЕЖЕДНЕВНЫЙ ПРОГРЕСС (сбрасывается раз в сутки, питает задания пасса) ----------
  function todayKey() {
    return new Date().toDateString();
  }

  function ensureDailyFresh() {
    const key = todayKey();
    if (!state.dailyProgress || state.dailyProgress.day !== key) {
      state.dailyProgress = { day: key, tapsToday: 0, upgradesBoughtToday: 0, upgradesCompletedToday: 0, wheelToday: 0 };
    }
  }

  function bumpDaily(field) {
    ensureDailyFresh();
    state.dailyProgress[field] = (state.dailyProgress[field] || 0) + 1;
  }

  function getQuestValue(type) {
    ensureDailyFresh();
    return state.dailyProgress[type] || 0;
  }

  function isQuestClaimed(id) {
    ensureDailyFresh();
    return state.claimedQuestsToday[id] === state.dailyProgress.day;
  }

  // ---------- ЗАДАНИЯ ДНЯ (кормят опытом баттл-пасс) ----------
  function renderQuests() {
    const container = $("#questsList");
    if (!container) return;
    ensureDailyFresh();
    container.innerHTML = CONFIG.DAILY_QUESTS.map(q => {
      const value = getQuestValue(q.type);
      const claimed = isQuestClaimed(q.id);
      const ready = !claimed && value >= q.threshold;
      const pct = Math.min(100, (value / q.threshold) * 100);
      return `
        <div class="goal-item ${claimed ? "done" : ""}">
          <div class="goal-item-icon">${q.icon}</div>
          <div class="goal-item-info">
            <div class="goal-item-title">${q.title}</div>
            <div class="goal-item-desc">+${q.xp} XP пасса</div>
            ${claimed ? "" : `
              <div class="goal-item-progress-bar"><div class="goal-item-progress-fill" style="width:${pct}%"></div></div>
              <div class="goal-item-progress-text">${formatNumber(Math.min(value, q.threshold))} / ${formatNumber(q.threshold)}</div>
            `}
          </div>
          <button class="goal-item-claim ${claimed ? "claimed" : ""}" data-quest="${q.id}" ${claimed || !ready ? "disabled" : ""}>
            ${claimed ? "✓" : ready ? "Забрать" : "🔒"}
          </button>
        </div>
      `;
    }).join("");
  }

  function claimQuest(id) {
    const q = CONFIG.DAILY_QUESTS.find(x => x.id === id);
    if (!q) return;
    if (isQuestClaimed(id)) return;
    const value = getQuestValue(q.type);
    if (value < q.threshold) return;

    state.claimedQuestsToday[id] = state.dailyProgress.day;
    addPassXp(q.xp);
    haptic("medium");
    toast(`+${q.xp} XP — задание выполнено!`);
    persist();
    renderQuests();
  }

  // ---------- БАТТЛ-ПАСС: 30 уровней, бессрочно, опыт растёт от тапов + заданий ----------
  let passTrackView = "free";

  function getPassProgress() {
    let remaining = state.passXp || 0;
    let level = 0;
    let xpForNext = 0;
    for (const lv of CONFIG.PASS_LEVELS) {
      if (remaining >= lv.xpNeeded) { remaining -= lv.xpNeeded; level = lv.level; }
      else { xpForNext = lv.xpNeeded; break; }
    }
    const maxLevel = CONFIG.PASS_LEVELS[CONFIG.PASS_LEVELS.length - 1].level;
    const isMax = level >= maxLevel;
    return { level, xpIntoLevel: remaining, xpForNext, isMax, maxLevel };
  }

  function addPassXp(amount) {
    state.passXp = (state.passXp || 0) + amount;
    persist();
    renderPass();
  }

  // ---------- ПРЕМИУМ-ТРЕК: 3 рекламы или 1000 кристаллов ----------
  function renderPremiumCard() {
    const card = $("#premiumPassCard");
    const badge = $("#premiumUnlockedBadge");
    if (!card || !badge) return;
    if (state.premiumUnlocked) {
      card.classList.add("hidden");
      badge.classList.remove("hidden");
      return;
    }
    card.classList.remove("hidden");
    badge.classList.add("hidden");
    $("#premiumAdCount").textContent = state.premiumAdsWatched || 0;
    $("#premiumBuyBtn").innerHTML = `<img src="img/crystal-gem.png" class="inline-icon" alt="">Купить за ${CONFIG.PREMIUM_PASS_ROBUX_COST}`;
    $("#premiumBuyBtn").disabled = (state.robux || 0) < CONFIG.PREMIUM_PASS_ROBUX_COST;
  }

  async function watchPremiumAd() {
    if (state.premiumUnlocked) return;
    async function grantWatch() {
      state.premiumAdsWatched = (state.premiumAdsWatched || 0) + 1;
      if (state.premiumAdsWatched >= CONFIG.PREMIUM_PASS_AD_WATCHES_NEEDED) {
        unlockPremiumPass();
      } else {
        toast(`Реклама засчитана (${state.premiumAdsWatched}/${CONFIG.PREMIUM_PASS_AD_WATCHES_NEEDED})`);
        persist();
        renderPremiumCard();
      }
    }
    if (!CONFIG.ADSGRAM_REWARD_BLOCK_ID || !adsgramReward) { await grantWatch(); return; }
    try { await adsgramReward.show(); await grantWatch(); }
    catch (err) { toast("Реклама не показана, попробуй позже"); }
  }

  function buyPremiumWithRobux() {
    if (state.premiumUnlocked) return;
    if ((state.robux || 0) < CONFIG.PREMIUM_PASS_ROBUX_COST) { toast(`Нужно ${CONFIG.PREMIUM_PASS_ROBUX_COST} ${CONFIG.ROBUX_NAME}`); return; }
    state.robux -= CONFIG.PREMIUM_PASS_ROBUX_COST;
    renderBalance();
    unlockPremiumPass();
  }

  function unlockPremiumPass() {
    state.premiumUnlocked = true;
    haptic("heavy");
    toast("👑 Премиум-трек баттл-пасса открыт!");
    persist();
    renderPremiumCard();
    renderPass();
  }

  // ---------- ТРЕК НАГРАД ----------
  function renderPassSummary() {
    const progress = getPassProgress();
    const badge = $("#passLevelNum");
    const xpText = $("#passXpText");
    const fill = $("#passSummaryFill");
    if (badge) badge.textContent = progress.level;
    if (xpText) {
      xpText.textContent = progress.isMax
        ? "Макс. уровень достигнут!"
        : `${formatNumber(progress.xpIntoLevel)} / ${formatNumber(progress.xpForNext)} XP`;
    }
    if (fill) fill.style.width = progress.isMax ? "100%" : Math.min(100, (progress.xpIntoLevel / progress.xpForNext) * 100) + "%";
    renderPassTeaser(progress);
    return progress;
  }

  function renderPassTeaser(progress) {
    progress = progress || getPassProgress();
    const level = $("#passTeaserLevel");
    const fill = $("#passTeaserFill");
    const crown = $("#passTeaserCrown");
    if (level) level.textContent = progress.level;
    if (fill) fill.style.width = progress.isMax ? "100%" : Math.min(100, (progress.xpIntoLevel / progress.xpForNext) * 100) + "%";
    if (crown) crown.classList.toggle("hidden", !state.premiumUnlocked);
  }

  // ---------- "ОТКРЫТИЕ" ПАССА С ГЛАВНОГО ЭКРАНА ----------
  function openPassFullscreen() {
    const card = $("#passTeaserCard");
    haptic("medium");
    if (!card || card.getBoundingClientRect().width === 0) { openPassModal(); return; }
    const rect = card.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "pass-expand-overlay";
    overlay.style.top = rect.top + "px";
    overlay.style.left = rect.left + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.style.borderRadius = "18px";
    overlay.innerHTML = `<span class="pass-expand-icon">🎫</span>`;
    document.body.appendChild(overlay);
    void overlay.offsetWidth; // форсируем reflow перед стартом анимации
    requestAnimationFrame(() => {
      overlay.style.top = "0px";
      overlay.style.left = "0px";
      overlay.style.width = "100vw";
      overlay.style.height = "100vh";
      overlay.style.borderRadius = "0px";
    });
    setTimeout(() => {
      openPassModal();
      overlay.classList.add("fade-out");
      setTimeout(() => overlay.remove(), 280);
    }, 380);
  }

  function renderPass() {
    const progress = renderPassSummary();

    renderPremiumCard();

    const list = $("#passLevelsList");
    if (!list) return;
    const isPremiumView = passTrackView === "premium";
    list.innerHTML = CONFIG.PASS_LEVELS.map(lv => {
      const reward = isPremiumView ? lv.premiumReward : lv.reward;
      const claimedArr = isPremiumView ? state.claimedPremiumLevels : state.claimedFreeLevels;
      const claimed = claimedArr.includes(lv.level);
      const unlockedByLevel = progress.level >= lv.level;
      const trackAvailable = !isPremiumView || state.premiumUnlocked;
      const ready = unlockedByLevel && trackAvailable && !claimed;
      const chestIcon = claimed
        ? `<img src="img/chest-open.png" class="pass-level-chest" alt="">`
        : `<img src="img/chest-closed.png" class="pass-level-chest" alt="">`;
      return `
        <div class="goal-item ${claimed ? "done" : ""}">
          ${chestIcon}
          <div class="goal-item-icon pass-level-badge">${lv.level}</div>
          <div class="goal-item-info">
            <div class="goal-item-title">${rewardIcon(reward)} ${rewardLabel(reward)}</div>
            <div class="goal-item-desc">Нужно ${formatNumber(lv.xpNeeded)} XP на этом уровне</div>
          </div>
          <button class="goal-item-claim ${claimed ? "claimed" : ""}" data-pass-level="${lv.level}" data-track="${isPremiumView ? "premium" : "free"}" ${claimed || !ready ? "disabled" : ""}>
            ${claimed ? "✓" : ready ? "Забрать" : (trackAvailable ? "🔒" : "👑")}
          </button>
        </div>
      `;
    }).join("");
  }

  function claimPassLevel(level, track) {
    level = Number(level);
    const lv = CONFIG.PASS_LEVELS.find(x => x.level === level);
    if (!lv) return;
    const isPremiumView = track === "premium";
    if (isPremiumView && !state.premiumUnlocked) return;
    const claimedArr = isPremiumView ? state.claimedPremiumLevels : state.claimedFreeLevels;
    if (claimedArr.includes(level)) return;
    if (getPassProgress().level < level) return;

    const reward = isPremiumView ? lv.premiumReward : lv.reward;
    grantReward(reward);
    claimedArr.push(level);
    haptic("heavy");
    toast(`🎫 Уровень ${level}: ${rewardLabel(reward)}!`);
    persist();
    renderPass();
  }

  // ---------- БОССЫ БАТТЛ-ПАССА: убей 3 монстров тапами ----------
  function ensureBossHpInit() {
    if (state.bossHp === null || state.bossHp === undefined) {
      const boss = CONFIG.BOSSES[state.bossIndex];
      state.bossHp = boss ? boss.hp : 0;
    }
  }

  function renderBossBanner() {
    const banner = $("#bossBanner");
    const doneBanner = $("#bossDoneBanner");
    if (!banner) return;
    ensureBossHpInit();
    const boss = CONFIG.BOSSES[state.bossIndex];
    if (!boss) {
      banner.classList.add("hidden");
      doneBanner?.classList.remove("hidden");
      return;
    }
    banner.classList.remove("hidden");
    doneBanner?.classList.add("hidden");
    $("#bossImage").src = boss.image;
    $("#bossName").textContent = boss.name;
    const pct = Math.max(0, Math.min(100, (state.bossHp / boss.hp) * 100));
    $("#bossHpFill").style.width = pct + "%";
    $("#bossHpText").textContent = `${formatNumber(Math.max(0, state.bossHp))} / ${formatNumber(boss.hp)} HP`;
  }

  function damageBoss(amount) {
    ensureBossHpInit();
    if (state.bossIndex >= CONFIG.BOSSES.length) return;
    state.bossHp -= amount;
    if (state.bossHp <= 0) defeatCurrentBoss();
    renderBossBanner();
  }

  function defeatCurrentBoss() {
    const boss = CONFIG.BOSSES[state.bossIndex];
    if (!boss) return;
    grantReward(boss.reward);
    state.defeatedBosses.push(boss.id);
    state.bossIndex += 1;
    const nextBoss = CONFIG.BOSSES[state.bossIndex];
    state.bossHp = nextBoss ? nextBoss.hp : 0;
    toast(`💥 ${boss.name} повержен! ${rewardLabel(boss.reward)}`);
    haptic("heavy");
    persist();
    renderBosses();
  }

  function renderBosses() {
    const list = $("#bossesList");
    if (!list) return;
    list.innerHTML = CONFIG.BOSSES.map((boss, i) => {
      const defeated = state.defeatedBosses.includes(boss.id);
      const active = i === state.bossIndex;
      const status = defeated ? "Повержен" : active ? "Сражайся тапами!" : "Заблокирован";
      return `
        <div class="goal-item ${defeated ? "done" : ""}">
          <img src="${boss.image}" class="boss-list-image" alt="">
          <div class="goal-item-info">
            <div class="goal-item-title">${boss.name}</div>
            <div class="goal-item-desc">${status} · Награда: ${rewardIcon(boss.reward)} ${rewardLabel(boss.reward)}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  // ---------- НАВИГАЦИЯ ----------
  function switchScreen(name) {
    $$(".screen").forEach(s => s.classList.remove("active"));
    $(`#screen-${name}`).classList.add("active");
    $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.screen === name));
    moveTabIndicator(name);
    haptic("light");
    if (name === "goals") renderGoals();
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

  // ---------- ОКНО БАТТЛ-ПАССА (отдельная модалка, а не вкладка) ----------
  function openPassModal() {
    renderQuests();
    renderPass();
    $("#passModal").classList.add("show");
    haptic("light");
  }

  function closePassModal() {
    $("#passModal").classList.remove("show");
    haptic("light");
  }

  // ---------- ПРИВЯЗКА СОБЫТИЙ ----------
  function bindEvents() {
    $("#coinBtn").addEventListener("click", handleTap);

    $$(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.dataset.screen === "pass") { openPassModal(); return; }
        switchScreen(btn.dataset.screen);
      });
    });

    $("#passModalClose").addEventListener("click", closePassModal);

    $$("#screen-shop .shop-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#screen-shop .shop-tab").forEach(b => b.classList.remove("active"));
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

    $("#passTeaserCard").addEventListener("click", openPassFullscreen);

    $("#wheelOpenBtn").addEventListener("click", openWheelModal);
    $("#wheelModalClose").addEventListener("click", closeWheelModal);
    $("#wheelModal").addEventListener("click", (e) => {
      if (e.target.id === "wheelModal") closeWheelModal();
    });
    $("#wheelSpinBtn").addEventListener("click", () => spinWheel(false));
    $("#wheelAdSpinBtn").addEventListener("click", spinWheelViaAd);

    $("#goalsList").addEventListener("click", (e) => {
      const btn = e.target.closest(".goal-item-claim");
      if (btn && !btn.disabled) claimAchievement(btn.dataset.id);
    });

    $("#questsList").addEventListener("click", (e) => {
      const btn = e.target.closest(".goal-item-claim");
      if (btn && !btn.disabled) claimQuest(btn.dataset.quest);
    });

    $("#passLevelsList").addEventListener("click", (e) => {
      const btn = e.target.closest(".goal-item-claim");
      if (btn && !btn.disabled) claimPassLevel(btn.dataset.passLevel, btn.dataset.track);
    });

    $$(".pass-track-tabs .shop-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".pass-track-tabs .shop-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        passTrackView = btn.dataset.track;
        renderPass();
      });
    });

    $("#premiumAdBtn").addEventListener("click", watchPremiumAd);
    $("#premiumBuyBtn").addEventListener("click", buyPremiumWithRobux);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { state.lastSeen = Date.now(); persist(); }
    });
  }

  init();
})();
