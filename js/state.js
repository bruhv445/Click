// =========================================================
// state.js — центральное состояние игры, конфигурация,
// подписки на изменения (простая шина событий)
//
// Обычный скрипт (без type="module"), чтобы игра работала
// и при открытии файла напрямую (file://), и на любом сервере.
// Всё публичное API кладём в глобальный объект window.G.state
//
// ВАЖНО: игра пошаговая (по дням). Баланс не меняется в
// реальном времени — только по кнопке «Следующий день».
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};

  const CONFIG = {
    PLAYTIME_TICK_MS: 1000,        // просто для счётчика "время в игре"
    SAVE_INTERVAL_MS: 15000,       // фоновое автосохранение (доп. к явным saveGame())
    MAX_BALANCE_HISTORY: 90,       // сколько последних дней хранить для графика

    TAX_INTERVAL_DAYS: 60,         // налог начисляется раз в 60 игровых дней
    TAX_BRACKETS: [                // прогрессивная шкала от дневного дохода
      { max: 5000,       rate: 0.05 },
      { max: 20000,      rate: 0.10 },
      { max: 100000,     rate: 0.15 },
      { max: 500000,     rate: 0.22 },
      { max: 2000000,    rate: 0.28 },
      { max: Infinity,   rate: 0.35 },
    ],
    CRYSTAL_PER_TAX_RUB: 2000,     // 1 кристалл гасит 2000 ₽ налога

    // здоровье / питание / настроение (0..100)
    NUTRITION_DECAY_PER_DAY: 10,
    NUTRITION_STARVE_HEALTH_PENALTY: 15,
    MOOD_DECAY_PER_DAY: 5,
    MOOD_DECAY_NEGATIVE_INCOME: 10,
    MOOD_DECAY_MISSED_PAYMENT: 15,
    HEALTH_REGEN_PER_DAY: 5,
    HEALTH_DECAY_LOW_MOOD: 10,
    CRYSTAL_FULL_RESTORE_COST: 12,

    EVENT_CHANCE_PER_DAY: 0.22,
    BOOST_DEFAULT_DAYS: 3,

    // Interstitial-реклама (не вознаграждаемая): показывается только на
    // естественном переходе (после закрытия итогов дня), не раньше
    // INTERSTITIAL_MIN_DAY и не чаще раза в INTERSTITIAL_INTERVAL_DAYS
    // игровых дней — чтобы не быть навязчивой и не нарушать модерацию.
    INTERSTITIAL_MIN_DAY: 4,
    INTERSTITIAL_INTERVAL_DAYS: 3,

    // Сколько "эффективных часов" в день приносят бизнесы/сотрудники.
    // Раньше здесь было скрытое ×24 — это и позволяло за 2-3 дня
    // разбогатеть. Теперь экономика рассчитана так, чтобы первый
    // миллион на балансе реально зарабатывался примерно к 40-му дню
    // при разумной, не читерской игре.
    EFFECTIVE_WORK_HOURS: 3,

    // --- кредиты: усложнённые правила ---
    CREDIT_MIN_DAY: 3,             // кредит недоступен в первые дни игры
    CREDIT_ORIGINATION_FEE_PCT: 0.05, // комиссия за оформление (удерживается сразу)
    CREDIT_INCOME_MARGIN: 2.0,     // чистый доход должен быть ≥ дневного платежа × 2
    CREDIT_COOLDOWN_DAYS: 10,      // обычный кулдаун после закрытия кредита
    CREDIT_EARLY_REPAY_COOLDOWN_DAYS: 5, // сокращённый кулдаун при досрочном погашении
    CREDIT_EARLY_REPAY_FEE_PCT: 0.03, // комиссия за досрочное погашение остатка
    CREDIT_DEFAULT_MISSED_LIMIT: 5, // столько пропусков подряд — дефолт (списание долга)
    CREDIT_DEFAULT_COOLDOWN_DAYS: 20,
    CREDIT_DEFAULT_REPUTATION_PENALTY: -20,

    STORAGE_KEY: 'biz_sim_save_v2',
  };

  const REPUTATION_LEVELS = [
    { min: 0,   max: 20,  name: 'Новичок' },
    { min: 20,  max: 50,  name: 'Предприниматель' },
    { min: 50,  max: 100, name: 'Владелец компании' },
    { min: 100, max: 200, name: 'Крупный бизнесмен' },
    { min: 200, max: Infinity, name: 'Бизнес-магнат' },
  ];

  function freshState() {
    return {
      version: 2,
      day: 1,
      balance: 0,
      reputation: 0,
      crystals: 0,

      health: 100,
      nutrition: 100,
      mood: 100,
      burnoutDays: 0, // сколько дней подряд в выгорании

      totalEarned: 0,
      totalExpenses: 0,
      totalTaxPaid: 0,
      maxBalance: 0,
      startTime: Date.now(),
      playTimeMs: 0,

      onboarded: false,
      tutorialSeen: false,

      // последний день, в который показывался interstitial-блок
      // (пэйсинг показа рекламы, не награда)
      lastInterstitialDay: 0,

      // businessId -> { owned, upgrades: [ids...] }
      businesses: {},

      // employeeId -> count hired
      employees: {},

      // propertyId -> true (коммерческая недвижимость)
      properties: {},

      // luxuryId -> true (личное имущество: машины, дома, яхты, острова...)
      luxury: {},

      // активные инвестиции: [{ uid, typeId, amount, startDay, matureDay, resolved }]
      investments: [],

      // единственный активный кредит (или null) — не больше одного одновременно
      // { uid, amount, rate, days, dailyPayment, startDay, daysPaid, remainingAmount, missedPayments }
      credit: null,

      // день, начиная с которого снова можно брать кредит (кулдаун после
      // погашения/списания предыдущего)
      creditCooldownUntilDay: 0,

      // выбранная на сегодня подработка (id из JOB_DEFS) или null.
      // Сбрасывается каждый advanceDay() — работу нужно выбирать заново.
      selectedJob: null,

      // achievementId -> true
      achievements: {},

      // временные бусты: [{ id, kind, value, expiresDay }]
      boosts: [],

      // скидка на следующее улучшение (из магазина кристаллов)
      nextUpgradeDiscount: 0,

      balanceHistory: [], // [{day, v}]

      stats: {
        businessesOpened: 0,
        upgradesBought: 0,
        employeesHired: 0,
        adsWatched: 0,
        eventsSeen: 0,
        taxCyclesPaid: 0,
        burnoutEvents: 0,
        creditsDefaulted: 0,
        daysWorked: 0,
      },

      eventLog: [], // {day, text}
    };
  }

  let currentState = freshState();

  // Прокси со стабильной "личностью": другие модули один раз делают
  // `const state = G.state.state;` и продолжают видеть актуальные данные
  // даже после resetState()/replaceState(), которые пересоздают
  // currentState целиком.
  const stateProxy = new Proxy({}, {
    get(_target, prop) { return currentState[prop]; },
    set(_target, prop, value) { currentState[prop] = value; return true; },
    has(_target, prop) { return prop in currentState; },
    ownKeys() { return Reflect.ownKeys(currentState); },
    deleteProperty(_target, prop) { delete currentState[prop]; return true; },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(currentState, prop);
    },
  });

  // ---------------------------------------------------------
  // Простая шина событий, чтобы UI перерисовывался при изменениях
  // ---------------------------------------------------------
  const listeners = {};

  function on(evt, fn) {
    if (!listeners[evt]) listeners[evt] = [];
    listeners[evt].push(fn);
    return function () { off(evt, fn); };
  }

  function off(evt, fn) {
    if (!listeners[evt]) return;
    listeners[evt] = listeners[evt].filter((f) => f !== fn);
  }

  function notify(evt, payload) {
    (listeners[evt] || []).forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('listener error', evt, e); }
    });
    (listeners['*'] || []).forEach((fn) => {
      try { fn(evt, payload); } catch (e) { console.error('listener error', evt, e); }
    });
  }

  function resetState() {
    currentState = freshState();
    notify('state:reset');
  }

  function replaceState(next) {
    const fresh = freshState();
    // миграция со старого формата сохранения (v1, реал-тайм): если находим
    // старые поля credits[]/lastTick — просто игнорируем их, берём дефолты v2
    const freshStats = fresh.stats;
    const merged = Object.assign(fresh, next);
    // stats — отдельный объединённый merge, чтобы новые поля статистики
    // (появившиеся в более новой версии игры) не терялись при загрузке
    // старого сохранения
    merged.stats = Object.assign({}, freshStats, next && next.stats ? next.stats : {});
    if (!Array.isArray(merged.investments)) merged.investments = [];
    if (!merged.luxury || typeof merged.luxury !== 'object') merged.luxury = {};
    if (next && Array.isArray(next.credits)) {
      // старое сохранение с несколькими кредитами — оставляем только первый
      merged.credit = next.credits.length ? next.credits[0] : null;
    }
    if (typeof merged.creditCooldownUntilDay !== 'number') merged.creditCooldownUntilDay = 0;
    if (typeof merged.day !== 'number' || merged.day < 1) merged.day = 1;
    currentState = merged;
    notify('state:reset');
  }

  // ---------------------------------------------------------
  // Уровень репутации
  // ---------------------------------------------------------
  function getReputationLevel(rep) {
    return REPUTATION_LEVELS.find((l) => rep >= l.min && rep < l.max) || REPUTATION_LEVELS[0];
  }

  function addReputation(amount) {
    const before = getReputationLevel(currentState.reputation);
    currentState.reputation = Math.max(0, currentState.reputation + amount);
    const after = getReputationLevel(currentState.reputation);
    if (after.name !== before.name && amount > 0) {
      notify('reputation:levelup', after);
    }
    notify('state:changed');
  }

  function addCrystals(amount) {
    currentState.crystals = Math.max(0, currentState.crystals + amount);
    notify('state:changed');
  }

  window.G.state = {
    CONFIG,
    REPUTATION_LEVELS,
    state: stateProxy,
    on,
    off,
    notify,
    resetState,
    replaceState,
    getReputationLevel,
    addReputation,
    addCrystals,
  };
})();
