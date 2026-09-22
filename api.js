// ============================================================
//  API — общение с backend (или localStorage, если API_URL пуст)
// ============================================================
const API = (() => {
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || "";
  const hasBackend = !!CONFIG.API_URL;

  const LOCAL_KEY = "starcoin_state_v1";

  function getStartParam() {
    // 1) обычный способ: ссылка вида t.me/bot?startapp=ref_xxx — Telegram сам кладёт это в initData
    const fromTg = tg?.initDataUnsafe?.start_param;
    if (fromTg) return fromTg;
    // 2) запасной способ: бот прислал кнопку с ?start_param=ref_xxx в самом URL мини-аппа
    const fromQuery = new URLSearchParams(window.location.search).get("start_param");
    return fromQuery || "";
  }

  function defaultState(startParam) {
    const refId = parseStartParamRef(startParam);
    return {
      id: "local_" + Math.random().toString(36).slice(2),
      username: tg?.initDataUnsafe?.user?.first_name || "Игрок",
      balance: 0,
      robux: 0,
      perClick: 1,
      energy: CONFIG.START_ENERGY_MAX,
      energyMax: CONFIG.START_ENERGY_MAX,
      lastSeen: Date.now(),
      upgrades: {},          // { upgradeId: level }
      pendingUpgrades: {},   // { upgradeId: readyAtTimestamp } — апгрейды, которые ещё "качаются"
      referrals: [],         // [{ name, joinedAt, earned }]
      referredBy: refId || null,
      completedTasks: [],
      adsWatched: 0,
      buffUntil: 0,          // до какого момента (timestamp) действует буст x2 к клику
      exchangeHistory: [],   // [{ nickname, amount, robux, ts }] — история обменов на кристаллы
      lastExchangeNick: "",  // последний введённый ник — чтобы не вводить каждый раз заново
      usedPromoCodes: [],    // хеши уже активированных промокодов — каждый код можно ввести один раз
      totalTaps: 0,          // всего тапов за всё время — для достижений
      totalUpgradesBought: 0,// всего куплено (завершено) апгрейдов — для достижений
      wheelSpins: 0,         // сколько раз крутили колесо удачи
      lastWheelSpin: 0,      // timestamp последнего бесплатного спина — доступен раз в 24 часа
      lastAdWheelSpin: 0,    // timestamp последнего доп. спина за рекламу
      claimedAchievements: [], // id уже полученных достижений
      maxCombo: 0,           // лучшее комбо за всё время — для достижений

      passXp: 0,              // суммарный опыт баттл-пасса (растёт от тапов + заданий), бессрочный
      claimedFreeLevels: [],   // номера уровней бесплатного трека, за которые награда забрана
      claimedPremiumLevels: [],// номера уровней премиум-трека, за которые награда забрана
      premiumUnlocked: false, // открыт ли премиум-трек
      premiumAdsWatched: 0,   // сколько реклам просмотрено для бесплатного открытия премиума (нужно 3)
      claimedQuestsToday: {}, // { questId: "дата дня, за который выполнено" }
      dailyProgress: {        // счётчики за текущий день — сбрасываются при смене дня
        day: "",
        tapsToday: 0,
        upgradesBoughtToday: 0,
        upgradesCompletedToday: 0,
        wheelToday: 0,
      },

      bossIndex: 0,           // индекс текущего активного босса (0..2), 3 = все повержены
      bossHp: null,           // текущее здоровье активного босса (null => взять из конфига при первом заходе)
      defeatedBosses: [],     // id повеженных боссов
    };
  }

  function parseStartParamRef(startParam) {
    if (!startParam) return null;
    const m = /^ref_(.+)$/.exec(startParam);
    return m ? m[1] : null;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        // merge с дефолтами — на случай, если в сохранёнке ещё нет новых полей
        // (например, игрок сохранился до того, как появились кристаллы/бусты)
        return Object.assign(defaultState(getStartParam()), JSON.parse(raw));
      }
    } catch (e) { /* ignore */ }
    const state = defaultState(getStartParam());
    saveLocal(state);
    return state;
  }

  function saveLocal(state) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  async function request(path, options = {}) {
    const res = await fetch(CONFIG.API_URL + path, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": initData,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${path} -> ${res.status}: ${text}`);
    }
    return res.json();
  }

  return {
    hasBackend,

    // Загрузить/создать состояние игрока
    async fetchState() {
      if (!hasBackend) return loadLocal();
      return request("/api/state?start_param=" + encodeURIComponent(getStartParam()));
    },

    // Отправить накопленные тапы (батчами, не на каждый тап — экономим трафик и защищаем от читеров)
    async sendTaps(count) {
      if (!hasBackend) return null; // локально баланс уже посчитан на клиенте
      return request("/api/tap", { method: "POST", body: { count } });
    },

    async buyUpgrade(upgradeId) {
      if (!hasBackend) return null;
      return request("/api/buy", { method: "POST", body: { upgradeId } });
    },

    async claimAdReward(kind) {
      if (!hasBackend) return null;
      return request("/api/ad-reward", { method: "POST", body: { kind } });
    },

    async completeTask(taskId) {
      if (!hasBackend) return null;
      return request("/api/task", { method: "POST", body: { taskId } });
    },

    async fetchReferrals() {
      if (!hasBackend) return { referrals: loadLocal().referrals, earned: 0 };
      return request("/api/referrals");
    },

    // Локальный режим: только сохранение на устройстве
    saveLocalState: saveLocal,
    loadLocalState: loadLocal,
  };
})();
