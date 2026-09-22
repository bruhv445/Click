// ============================================================
//  КОНФИГУРАЦИЯ ИГРЫ — правь здесь, не трогая логику в app.js
// ============================================================

// Простое хеширование строки — промокоды хранятся не открытым текстом, а числом-хешем,
// чтобы код не читался с первого взгляда при простом просмотре файла.
// ВАЖНО: это не настоящая защита (игра клиентская, файл всё равно можно разобрать),
// а просто способ не публиковать код "как есть" прямо в конфиге.
function _hashPromo(str) {
  let h = 0;
  str = str.trim().toLowerCase().replace(/^#/, "");
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

// Генерируем 30 уровней баттл-пасса: два трека, бесплатный и премиум.
// Опыт нужен всё больше с каждым уровнем, награды растут вместе с ним.
// Бесплатный: каждый 3-й уровень — крупные монеты, каждый 5-й — доп. спин колеса, каждый 10-й — кристаллы.
// Премиум: заметно выше монеты, каждый 5-й уровень — кристаллы, финал (30) — большой набор.
function _buildPassLevels() {
  const levels = [];
  let xpNeeded = 120;
  for (let i = 1; i <= 30; i++) {
    let reward, premiumReward;
    if (i % 10 === 0) reward = { type: "robux", amount: 50 };
    else if (i % 5 === 0) reward = { type: "wheelToken" };
    else if (i % 3 === 0) reward = { type: "coins", amount: Math.round(600 * Math.pow(1.17, i)) };
    else reward = { type: "coins", amount: Math.round(300 * Math.pow(1.17, i)) };

    if (i === 30) premiumReward = { type: "bundle", coins: Math.round(5000 * Math.pow(1.17, i)), robux: 100 };
    else if (i % 5 === 0) premiumReward = { type: "robux", amount: 20 + i * 2 };
    else premiumReward = { type: "coins", amount: Math.round(900 * Math.pow(1.17, i)) };

    levels.push({ level: i, xpNeeded: Math.round(xpNeeded), reward, premiumReward });
    xpNeeded *= 1.15;
  }
  return levels;
}

const CONFIG = {
  // URL твоего backend (Render/Railway/Fly.io и т.п.).
  // Пусто "" => игра работает в офлайн-режиме (сохранение в localStorage телефона),
  // это удобно для теста дизайна без деплоя сервера.
  API_URL: "", // сервер временно отключён — игра работает локально на устройстве игрока

  // ID рекламных блоков AdsGram (partner.adsgram.ai -> Платформы -> блоки).
  // Пусто "" => соответствующая реклама просто выдаёт награду без показа ролика (режим теста).
  ADSGRAM_REWARD_BLOCK_ID: "49222",         // Reward video ad — за просмотр до конца выдаём награду
  ADSGRAM_INTERSTITIAL_BLOCK_ID: "int-49223", // Interstitial — полноэкранная реклама без награды (доп. доход)
  ADSGRAM_TASK_BLOCK_ID: "task-49224",      // Task — рекламные задания от рекламодателей AdsGram

  AD_TASK_REWARD: 1000,                     // сколько стадсов выдаём за выполненное рекламное задание
  // Не чаще раза в 7 минут показываем interstitial-рекламу. Это же значение используется как
  // "период тишины" сразу после открытия игры — до истечения 7 минут с момента входа
  // реклама вообще не появляется (см. lastInterstitialAt в app.js).
  INTERSTITIAL_MIN_INTERVAL_MS: 7 * 60 * 1000,

  // Username Telegram-бота без @ и short name мини-аппа (из BotFather /newapp) —
  // вместе они дают ссылку вида https://t.me/USERNAME/SHORTNAME?startapp=ref_<id>
  BOT_USERNAME: "Studs_Rush_bot",
  APP_SHORT_NAME: "Start",

  START_ENERGY_MAX: 1000,
  ENERGY_REGEN_PER_SEC: 1,       // сколько энергии восстанавливается в секунду
  ENERGY_COST_PER_TAP: 1,        // сколько энергии тратится на один тап

  CURRENCY_NAME: "стадсов",      // название валюты в текстах (родительный падеж мн.ч.)

  AD_COIN_REWARD: 500,           // награда за просмотр рекламы "заработать стадсы"

  // ---------- КРИСТАЛЛЫ (вторая валюта, обменивается на стадсы) ----------
  // Названо нейтрально (не "робуксы"), чтобы не пересекаться с товарным знаком Robux.
  ROBUX_NAME: "кристаллов",
  ROBUX_EXCHANGE_RATE: 1000000,   // сколько стадсов = 1 кристалл (игрок сам вводит сумму для обмена)
  ROBUX_EXCHANGE_MIN: 100,        // минимальная сумма обмена — 100 кристаллов за раз
  AD_ROBUX_REWARD: 5,             // награда кристаллами за отдельную рекламу

  // ---------- ВРЕМЯ ПРОКАЧКИ АПГРЕЙДОВ ----------
  // Без рекламы купленный апгрейд применяется не сразу, а через это время.
  // Просмотр рекламы мгновенно завершает прокачку.
  UPGRADE_DELAY_MS: 10 * 60 * 1000, // 10 минут

  // ---------- ВРЕМЕННЫЕ БУСТЫ x2 К КЛИКУ ----------
  BUFF_MULTIPLIER: 2,              // во сколько раз усиливается клик во время буста
  AUTO_BUFF_INTERVAL_MS: 5 * 60 * 1000,  // как часто сам появляется бесплатный буст
  AUTO_BUFF_DURATION_MS: 20 * 1000,      // на сколько включается бесплатный буст

  AD_BUFF_DURATION_MS: 30 * 1000,        // на сколько включается буст за рекламу (для старых мест использования)
  AD_OFFER_INTERVAL_MS: 5 * 60 * 1000,   // как часто на главном экране выскакивает предложение посмотреть рекламу (увеличено — меньше рекламы)
  AD_OFFER_VISIBLE_MS: 10 * 1000,        // сколько предложение висит на экране, если его не нажали

  // Разные варианты рекламных предложений на главном экране — при каждом появлении
  // выбирается случайный вариант из списка. Можно добавлять свои варианты.
  AD_OFFERS: [
    { kind: "buff",  multiplier: 2, durationMs: 30 * 1000, icon: "⚡", title: "x2 к клику на 30 сек!",  sub: "Посмотри рекламу и получи буст" },
    { kind: "buff",  multiplier: 3, durationMs: 20 * 1000, icon: "🔥", title: "x3 к клику на 20 сек!",  sub: "Мощный буст за один просмотр" },
    { kind: "coins", amount: 2000,                          icon: "💰", title: "+2 000 стадсов сразу!",  sub: "Забери бонус за рекламу" },
    { kind: "coins", amount: 5000,                          icon: "💵", title: "+5 000 стадсов сразу!",  sub: "Отличный бонус — не пропусти" },
    { kind: "coins", amount: 10000,                         icon: "💎", title: "+10 000 стадсов сразу!", sub: "Крупный бонус за просмотр рекламы" },
    { kind: "robux", amount: 10,                            icon: "🔷", title: "+10 кристаллов сразу!",   sub: "Редкий бонус для коллекции" },
  ],

  // Апгрейды "за тап" — увеличивают стадсы за один клик
  CLICK_UPGRADES: [
    { id: "tap_finger",   name: "Шустрый билдер",       baseCost: 100,     costMul: 1.15, effect: 1   },
    { id: "tap_glove",    name: "VIP-геймпасс",         baseCost: 1000,    costMul: 1.16, effect: 5   },
    { id: "tap_hammer",   name: "Молоток разработчика", baseCost: 12000,   costMul: 1.17, effect: 25  },
    { id: "tap_laser",    name: "Ускоритель скриптов",  baseCost: 150000,  costMul: 1.18, effect: 120 },
    { id: "tap_quantum",  name: "Мощный скрипт",        baseCost: 2000000, costMul: 1.20, effect: 600 },
  ],

  // ---------- КОМБО-СИСТЕМА (фирменная механика тапа, не завязанная на рекламу) ----------
  // Быстрые тапы подряд (без пауз длиннее COMBO_WINDOW_MS) наращивают комбо и множитель.
  COMBO_WINDOW_MS: 900,
  COMBO_TIERS: [
    { taps: 0,   mult: 1,   label: "" },
    { taps: 10,  mult: 1.3, label: "Комбо x1.3" },
    { taps: 25,  mult: 1.7, label: "Комбо x1.7" },
    { taps: 50,  mult: 2.2, label: "Комбо x2.2" },
    { taps: 100, mult: 3,   label: "🔥 УНИЧТОЖЕНИЕ x3" },
  ],

  // ---------- КРИТИЧЕСКИЙ ТАП ----------
  CRIT_CHANCE: 0.08,       // 8% шанс на каждый тап
  CRIT_MULTIPLIER: 5,      // во сколько раз усиливается крит

  // ---------- КОЛЕСО УДАЧИ (бесплатный спин раз в 24 часа, без рекламы) ----------
  // Реальная игровая механика, не завязанная на рекламу — рулетка с шансами.
  // weight — относительный вес сегмента (больше = выше шанс выпадения).
  WHEEL_AD_SPIN_COOLDOWN_MS: 5 * 60 * 1000, // доп. спин за рекламу — не чаще раза в 5 минут
  WHEEL_REWARDS: [
    { type: "coins", amount: 500,   weight: 30, icon: "💰" },
    { type: "coins", amount: 1500,  weight: 22, icon: "💵" },
    { type: "coins", amount: 3000,  weight: 16, icon: "💎" },
    { type: "coins", amount: 8000,  weight: 8,  icon: "🎉" },
    { type: "robux", amount: 2,     weight: 12, icon: "🔷" },
    { type: "robux", amount: 5,     weight: 6,  icon: "🔶" },
    { type: "buff",  multiplier: 2, durationMs: 60 * 1000, weight: 5, icon: "⚡" },
    { type: "coins", amount: 25000, weight: 1,  icon: "👑" }, // джекпот
  ],

  // ---------- ДОСТИЖЕНИЯ ----------
  // type определяет, из какого показателя берётся прогресс (см. getAchievementProgress в app.js):
  // taps — всего тапов, upgrades — всего куплено апгрейдов, exchange — обменов на кристаллы,
  // wheel — прокруток колеса удачи, level — уровень игрока.
  ACHIEVEMENTS: [
    { id: "taps_100",     type: "taps",     threshold: 100,   icon: "🥉", title: "Первые шаги",      desc: "Сделай 100 тапов",              reward: { type: "coins", amount: 500 } },
    { id: "taps_1000",    type: "taps",     threshold: 1000,  icon: "🥈", title: "Разогрев",          desc: "Сделай 1 000 тапов",            reward: { type: "coins", amount: 3000 } },
    { id: "taps_10000",   type: "taps",     threshold: 10000, icon: "🥇", title: "Марафонец",         desc: "Сделай 10 000 тапов",           reward: { type: "coins", amount: 20000 } },
    { id: "upgrades_1",   type: "upgrades", threshold: 1,     icon: "🔧", title: "Первый апгрейд",    desc: "Купи любой апгрейд",             reward: { type: "coins", amount: 1000 } },
    { id: "upgrades_5",   type: "upgrades", threshold: 5,     icon: "⚙️", title: "Мастер прокачки",   desc: "Купи 5 апгрейдов",               reward: { type: "coins", amount: 8000 } },
    { id: "exchange_1",   type: "exchange", threshold: 1,     icon: "💠", title: "Первый обмен",      desc: "Обменяй стадсы на кристаллы",    reward: { type: "robux", amount: 5 } },
    { id: "wheel_5",      type: "wheel",    threshold: 5,     icon: "🎡", title: "Любимец удачи",     desc: "Крути колесо 5 раз",             reward: { type: "coins", amount: 5000 } },
    { id: "combo_50",     type: "combo",    threshold: 50,    icon: "⚡", title: "Скорострел",        desc: "Набери комбо 50 тапов подряд",   reward: { type: "coins", amount: 10000 } },
    { id: "combo_100",    type: "combo",    threshold: 100,   icon: "💥", title: "Уничтожение",       desc: "Набери комбо 100 тапов подряд",  reward: { type: "coins", amount: 30000 } },
    { id: "level_5",      type: "level",    threshold: 5,     icon: "⭐", title: "Растём",            desc: "Достигни 5 уровня",              reward: { type: "coins", amount: 5000 } },
    { id: "level_10",     type: "level",    threshold: 10,    icon: "🌟", title: "Уверенный игрок",   desc: "Достигни 10 уровня",             reward: { type: "coins", amount: 15000 } },
  ],

  // ---------- БЕСПЛАТНЫЙ БАТТЛ-ПАСС ----------
  // Ежедневные задания начисляют опыт (XP), опыт двигает трек из 30 уровней, без сезонов —
  // прогресс постоянный, каждый уровень даёт бесплатную награду.
  DAILY_QUESTS: [
    { id: "dq_taps_100",        type: "tapsToday",               threshold: 100, xp: 20, icon: "👆", title: "Сделай 100 тапов" },
    { id: "dq_taps_300",        type: "tapsToday",               threshold: 300, xp: 40, icon: "👊", title: "Сделай 300 тапов" },
    { id: "dq_buy_upgrade",     type: "upgradesBoughtToday",     threshold: 1,   xp: 30, icon: "🛒", title: "Купи апгрейд" },
    { id: "dq_complete_upgrade",type: "upgradesCompletedToday",  threshold: 1,   xp: 35, icon: "⚙️", title: "Прокачай апгрейд до конца" },
    { id: "dq_wheel",           type: "wheelToday",              threshold: 1,   xp: 25, icon: "🎡", title: "Крути колесо удачи" },
  ],
  PASS_LEVELS: _buildPassLevels(),

  // Открыть премиум-трек можно бесплатно (3 рекламы) или за кристаллы
  PREMIUM_PASS_AD_WATCHES_NEEDED: 3,
  PREMIUM_PASS_ROBUX_COST: 1000,

  // ---------- БОССЫ: убей 3 монстров подряд, урон = сила тапа ----------
  BOSSES: [
    { id: "boss1", name: "Кислотный Рёва", image: "img/boss1.png", hp: 8000,   reward: { type: "coins", amount: 20000 } },
    { id: "boss2", name: "Ядовитый Жнец",  image: "img/boss2.png", hp: 35000,  reward: { type: "robux", amount: 25 } },
    { id: "boss3", name: "Бронированный Тиран", image: "img/boss3.png", hp: 120000, reward: { type: "bundle", coins: 150000, robux: 60 } },
  ],

  // Задания за подписку/вступление убраны — вели на несуществующие каналы (@your_channel),
  // что не прошло бы модерацию. Когда появятся реальные каналы/чаты — можно вернуть
  // сюда записи вида { id: "...", title: "...", reward: ..., url: "https://t.me/..." }.
  TASKS: [],

  // ---------- ПРОМОКОДЫ ----------
  // Код хранится как хеш (см. _hashPromo выше), а не открытым текстом — введённый игроком
  // код тоже хешируется и сравнивается с этим числом. Каждый код можно активировать один раз.
  // Чтобы добавить новый промокод — допиши в массив: { hash: _hashPromo("твой_код"), reward: {...} }.
  PROMO_CODES: [
    { hash: _hashPromo("bruh_445"), reward: { type: "coins", amount: 100000000 } },
  ],
};
