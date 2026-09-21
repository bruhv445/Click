// ============================================================
//  КОНФИГУРАЦИЯ ИГРЫ — правь здесь, не трогая логику в app.js
// ============================================================
const CONFIG = {
  // URL твоего backend (Render/Railway/Fly.io и т.п.).
  // Пусто "" => игра работает в офлайн-режиме (сохранение в localStorage телефона),
  // это удобно для теста дизайна без деплоя сервера.
  API_URL: "", // сервер временно отключён — игра работает локально на устройстве игрока

  // ID рекламного блока Adsgram (Partner -> Платформы -> твоя платформа -> Блоки).
  // Пусто "" => кнопки рекламы просто выдают награду без показа ролика (режим теста).
  ADSGRAM_BLOCK_ID: "",

  // Username Telegram-бота без @ и short name мини-аппа (из BotFather /newapp) —
  // вместе они дают ссылку вида https://t.me/USERNAME/SHORTNAME?startapp=ref_<id>
  BOT_USERNAME: "Studs_Rush_bot",
  APP_SHORT_NAME: "Start",

  START_ENERGY_MAX: 1000,
  ENERGY_REGEN_PER_SEC: 1,       // сколько энергии восстанавливается в секунду
  ENERGY_COST_PER_TAP: 1,        // сколько энергии тратится на один тап

  CURRENCY_NAME: "стадсов",      // название валюты в текстах (родительный падеж мн.ч.)

  AD_COIN_REWARD: 500,           // награда за просмотр рекламы "заработать стадсы"
  REF_BONUS_INVITER: 2500,       // бонус тому, кто пригласил
  REF_BONUS_INVITED: 1000,       // бонус приглашённому при первом старте

  // Апгрейды "за тап" — увеличивают стадсы за один клик
  CLICK_UPGRADES: [
    { id: "tap_finger",   name: "Шустрый билдер",       baseCost: 100,     costMul: 1.15, effect: 1   },
    { id: "tap_glove",    name: "VIP-геймпасс",         baseCost: 1000,    costMul: 1.16, effect: 5   },
    { id: "tap_hammer",   name: "Молоток разработчика", baseCost: 12000,   costMul: 1.17, effect: 25  },
    { id: "tap_laser",    name: "Ускоритель скриптов",  baseCost: 150000,  costMul: 1.18, effect: 120 },
    { id: "tap_quantum",  name: "Читерский эксплойт",   baseCost: 2000000, costMul: 1.20, effect: 600 },
  ],

  // Апгрейды "пассивный доход" — стадсы в секунду сами по себе
  PASSIVE_UPGRADES: [
    { id: "farm_miner",      name: "Юный NPC",          baseCost: 500,      costMul: 1.15, effect: 1   },
    { id: "farm_rig",        name: "Команда скриптеров",baseCost: 5000,     costMul: 1.16, effect: 8   },
    { id: "farm_datacenter", name: "Игровой сервер",    baseCost: 80000,    costMul: 1.17, effect: 60  },
    { id: "farm_satellite",  name: "Рекламная кампания",baseCost: 900000,   costMul: 1.18, effect: 400 },
    { id: "farm_ai",         name: "Игра недели",       baseCost: 12000000, costMul: 1.20, effect: 2500},
  ],

  // Простые задания-заглушки (подписка на канал и т.п.) — дорабатываются под свой проект
  TASKS: [
    { id: "join_channel", title: "Подписаться на канал", reward: 1000, url: "https://t.me/your_channel" },
    { id: "join_chat",    title: "Вступить в чат",       reward: 500,  url: "https://t.me/your_chat" },
  ],
};
