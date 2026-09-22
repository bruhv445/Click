// =========================================================
// achievements.js — система достижений
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};
  const S = window.G.state;
  const state = S.state;
  const notify = S.notify;

  const ACHIEVEMENT_DEFS = [
    {
      id: 'first_earn', name: 'Первый заработок', icon: '🏆',
      desc: 'Заработать первые 1 000 ₽',
      check: (s) => s.totalEarned >= 1000,
    },
    {
      id: 'first_business', name: 'Бизнесмен', icon: '🏆',
      desc: 'Открыть первый бизнес',
      check: () => window.G.businesses.getOwnedBusinessIds().length >= 1,
    },
    {
      id: 'first_employee', name: 'Первый сотрудник', icon: '🏆',
      desc: 'Нанять первого сотрудника',
      check: () => window.G.employees.getTotalEmployeeCount() >= 1,
    },
    {
      id: 'first_hundred_k', name: '100 тысяч', icon: '🏆',
      desc: 'Накопить 100 000 ₽',
      check: (s) => s.balance >= 100000,
    },
    {
      id: 'first_million', name: 'Первый миллион', icon: '🏆',
      desc: 'Накопить 1 000 000 ₽',
      check: (s) => s.balance >= 1000000,
    },
    {
      id: 'empire', name: 'Империя', icon: '🏆',
      desc: 'Владеть всеми 4 видами бизнеса',
      check: () => window.G.businesses.getOwnedBusinessIds().length >= 4,
    },
    {
      id: 'investor', name: 'Инвестор', icon: '🏆',
      desc: 'Совершить первую инвестицию',
      check: (s) => s.investments.length >= 1,
    },
    {
      id: 'property_owner', name: 'Владелец недвижимости', icon: '🏆',
      desc: 'Купить первое помещение',
      check: (s) => Object.keys(s.properties).length >= 1,
    },
    {
      id: 'magnate', name: 'Магнат', icon: '🏆',
      desc: 'Иметь капитал 100 000 000 ₽',
      check: (s) => s.balance >= 100000000,
    },
    {
      id: 'reputable', name: 'Уважаемый бизнесмен', icon: '🏆',
      desc: 'Достичь 100 репутации',
      check: (s) => s.reputation >= 100,
    },
    {
      id: 'tax_payer', name: 'Честный налогоплательщик', icon: '🏆',
      desc: 'Заплатить первый налог',
      check: (s) => s.stats.taxCyclesPaid >= 1,
    },
    {
      id: 'survivor', name: 'Пережил выгорание', icon: '🏆',
      desc: 'Восстановиться после выгорания',
      check: (s) => s.stats.burnoutEvents >= 1 && s.health > 0,
    },
    {
      id: 'month_survivor', name: '30 дней в бизнесе', icon: '🏆',
      desc: 'Продержаться 30 игровых дней',
      check: (s) => s.day >= 30,
    },
    {
      id: 'hard_worker', name: 'Трудяга', icon: '🏆',
      desc: 'Проработать на подработках 10 дней',
      check: (s) => s.stats.daysWorked >= 10,
    },
    {
      id: 'status_symbol', name: 'Статусная вещь', icon: '🏆',
      desc: 'Купить первую статусную вещь (машину, дом и т.д.)',
      check: () => window.G.luxury.getOwnedLuxuryIds().length >= 1,
    },
  ];

  function checkAchievements() {
    ACHIEVEMENT_DEFS.forEach((ach) => {
      if (state.achievements[ach.id]) return;
      if (ach.check(state)) {
        state.achievements[ach.id] = true;
        notify('achievement:unlocked', ach);
      }
    });
  }

  function getUnlockedCount() {
    return Object.keys(state.achievements).length;
  }

  window.G.achievements = {
    ACHIEVEMENT_DEFS,
    checkAchievements,
    getUnlockedCount,
  };
})();
