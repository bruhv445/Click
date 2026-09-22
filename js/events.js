// =========================================================
// events.js — случайные экономические события.
// Проверяются раз за advanceDay() с фиксированной вероятностью
// (CONFIG.EVENT_CHANCE_PER_DAY), эффект длится несколько игровых дней.
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};
  const S = window.G.state;
  const state = S.state;
  const notify = S.notify;
  const CONFIG = S.CONFIG;

  function B() { return window.G.businesses; }
  function E() { return window.G.economy; }

  const EVENT_DEFS = [
    {
      id: 'delivery_demand',
      text: 'В городе вырос спрос на доставку еды. Доход фастфуда +20% на несколько дней.',
      icon: '📦',
      condition: () => B().isBusinessOwned('fastfood'),
      apply: () => E().addBoost('income_mult', 1.20, CONFIG.BOOST_DEFAULT_DAYS),
    },
    {
      id: 'rent_up',
      text: 'Аренда в городе подорожала. Доход временно немного снизился.',
      icon: '📈',
      condition: () => B().getOwnedBusinessIds().length > 0,
      apply: () => E().addBoost('income_mult', 0.95, CONFIG.BOOST_DEFAULT_DAYS),
    },
    {
      id: 'big_client',
      text: 'Крупный клиент сделал заказ. Доход фриланса +25% на несколько дней.',
      icon: '💼',
      condition: () => B().isBusinessOwned('freelance'),
      apply: () => E().addBoost('income_mult', 1.25, CONFIG.BOOST_DEFAULT_DAYS),
    },
    {
      id: 'competitor',
      text: 'Рядом открылся конкурент. Доход немного снизился на несколько дней.',
      icon: '⚠️',
      condition: () => B().getOwnedBusinessIds().length > 0,
      apply: () => E().addBoost('income_mult', 0.92, CONFIG.BOOST_DEFAULT_DAYS),
    },
    {
      id: 'positive_reviews',
      text: 'Клиенты оставили много хороших отзывов. Доход +15% на несколько дней.',
      icon: '⭐',
      condition: () => B().getOwnedBusinessIds().length > 0,
      apply: () => E().addBoost('income_mult', 1.15, CONFIG.BOOST_DEFAULT_DAYS),
    },
    {
      id: 'tax_audit',
      text: 'Плановая налоговая проверка отняла немного времени и денег.',
      icon: '📋',
      condition: () => B().getOwnedBusinessIds().length > 1,
      apply: () => E().addBoost('income_mult', 0.93, CONFIG.BOOST_DEFAULT_DAYS),
    },
  ];

  function maybeTriggerEvent() {
    if (Math.random() > CONFIG.EVENT_CHANCE_PER_DAY) return null;
    const pool = EVENT_DEFS.filter((e) => e.condition());
    if (pool.length === 0) return null;

    const ev = pool[Math.floor(Math.random() * pool.length)];
    ev.apply();
    state.stats.eventsSeen += 1;
    state.eventLog.unshift({ day: state.day, text: ev.text });
    if (state.eventLog.length > 20) state.eventLog.pop();
    notify('event:triggered', ev);
    notify('state:changed');
    return ev;
  }

  window.G.events = {
    EVENT_DEFS,
    maybeTriggerEvent,
  };
})();
