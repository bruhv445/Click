// =========================================================
// businesses.js — определения бизнесов и деревьев улучшений
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};
  const S = window.G.state;
  const state = S.state;
  const notify = S.notify;
  const addReputation = S.addReputation;

  const BUSINESS_DEFS = {
    freelance: {
      id: 'freelance',
      name: 'Фриланс',
      icon: '💻',
      description: 'Небольшие заказы за компьютером. Самый дешёвый старт.',
      startCost: 0,
      baseIncome: 400,
      baseExpense: 0,
      upgrades: [
        { id: 'laptop', name: 'Ноутбук', cost: 4000, income: 1200, expense: 0, desc: 'Свой рабочий ноутбук вместо чужого компьютера' },
        { id: 'pc', name: 'Мощный компьютер', cost: 18000, income: 3800, expense: 300, desc: 'Ускоряет выполнение заказов' },
        { id: 'pro_gear', name: 'Профессиональная техника', cost: 55000, income: 8500, expense: 700, desc: 'Открывает крупные заказы' },
        { id: 'first_employee', name: 'Первый сотрудник', cost: 95000, income: 5000, expense: 1500, desc: 'Можно нанимать помощников', unlocksHiring: true },
        { id: 'office', name: 'Офис', cost: 280000, income: 19000, expense: 4200, desc: 'Постоянное рабочее пространство' },
        { id: 'agency', name: 'Агентство', cost: 1100000, income: 58000, expense: 16000, desc: 'Полноценное диджитал-агентство' },
        { id: 'big_company', name: 'Крупная компания', cost: 4800000, income: 190000, expense: 52000, desc: 'Выход на корпоративный рынок' },
      ],
    },

    fastfood: {
      id: 'fastfood',
      name: 'Фастфуд',
      icon: '🍔',
      description: 'Маленькая точка быстрого питания в проходном месте.',
      startCost: 50000,
      baseIncome: 3200,
      baseExpense: 1100,
      upgrades: [
        { id: 'equipment', name: 'Оборудование', cost: 28000, income: 4800, expense: 900, desc: 'Фритюрницы и грили ускоряют работу' },
        { id: 'more_clients', name: 'Поток клиентов', cost: 75000, income: 9000, expense: 1600, desc: 'Реклама точки увеличивает поток' },
        { id: 'interior', name: 'Улучшение интерьера', cost: 140000, income: 12000, expense: 2200, desc: 'Приятная атмосфера, +репутация', reputation: 5 },
        { id: 'staff_upgrade', name: 'Обучение персонала', cost: 240000, income: 18000, expense: 5200, desc: 'Быстрое и качественное обслуживание' },
        { id: 'second_point', name: 'Вторая точка', cost: 780000, income: 48000, expense: 14500, desc: 'Открытие точки в другом районе' },
      ],
    },

    autoservice: {
      id: 'autoservice',
      name: 'Автосервис',
      icon: '🚗',
      description: 'Ремонт и обслуживание автомобилей.',
      startCost: 150000,
      baseIncome: 5200,
      baseExpense: 1900,
      upgrades: [
        { id: 'tools', name: 'Инструменты', cost: 58000, income: 8200, expense: 1400, desc: 'Профессиональные инструменты' },
        { id: 'mechanics', name: 'Механики', cost: 145000, income: 15500, expense: 6200, desc: 'Опытная команда механиков' },
        { id: 'more_orders', name: 'Поток заказов', cost: 290000, income: 25500, expense: 4800, desc: 'Партнёрство со страховыми компаниями' },
        { id: 'new_boxes', name: 'Новые боксы', cost: 880000, income: 51000, expense: 15500, desc: 'Расширение количества постов' },
        { id: 'second_service', name: 'Второй автосервис', cost: 2900000, income: 118000, expense: 34500, desc: 'Филиал в другом районе города' },
      ],
    },

    shop: {
      id: 'shop',
      name: 'Интернет-магазин',
      icon: '🛒',
      description: 'Продажа товаров через собственный онлайн-магазин.',
      startCost: 25000,
      baseIncome: 1900,
      baseExpense: 500,
      upgrades: [
        { id: 'buy_goods', name: 'Закупка товаров', cost: 14000, income: 2900, expense: 500, desc: 'Расширение склада товаров' },
        { id: 'expand_assortment', name: 'Расширение ассортимента', cost: 38000, income: 6100, expense: 900, desc: 'Новые категории товаров' },
        { id: 'hire_staff', name: 'Наём сотрудников', cost: 88000, income: 10200, expense: 3900, desc: 'Обработка заказов быстрее' },
        { id: 'own_brand', name: 'Собственный бренд', cost: 390000, income: 29500, expense: 8100, desc: 'Товары под своей маркой', reputation: 8 },
        { id: 'warehouse', name: 'Собственный склад', cost: 1450000, income: 69000, expense: 19500, desc: 'Полный контроль над логистикой' },
      ],
    },
  };

  function getBusinessState(id) {
    if (!state.businesses[id]) {
      state.businesses[id] = { owned: false, upgrades: [] };
    }
    return state.businesses[id];
  }

  function isBusinessOwned(id) {
    return !!(state.businesses[id] && state.businesses[id].owned);
  }

  function getOwnedBusinessIds() {
    return Object.keys(state.businesses).filter((id) => state.businesses[id].owned);
  }

  function getNextUpgrade(bizId) {
    const def = BUSINESS_DEFS[bizId];
    const bs = getBusinessState(bizId);
    return def.upgrades.find((u) => bs.upgrades.indexOf(u.id) === -1) || null;
  }

  function getBusinessIncome(bizId) {
    const def = BUSINESS_DEFS[bizId];
    const bs = getBusinessState(bizId);
    if (!bs.owned) return 0;
    let income = def.baseIncome;
    def.upgrades.forEach((u) => {
      if (bs.upgrades.indexOf(u.id) !== -1) income += u.income;
    });
    return income;
  }

  function getBusinessExpense(bizId) {
    const def = BUSINESS_DEFS[bizId];
    const bs = getBusinessState(bizId);
    if (!bs.owned) return 0;
    let expense = def.baseExpense;
    def.upgrades.forEach((u) => {
      if (bs.upgrades.indexOf(u.id) !== -1) expense += u.expense;
    });
    return expense;
  }

  function getBusinessWorth(bizId) {
    const def = BUSINESS_DEFS[bizId];
    const bs = getBusinessState(bizId);
    if (!bs.owned) return 0;
    let worth = def.startCost;
    def.upgrades.forEach((u) => {
      if (bs.upgrades.indexOf(u.id) !== -1) worth += u.cost;
    });
    return worth;
  }

  function getTotalBusinessWorth() {
    return Object.keys(BUSINESS_DEFS).reduce((sum, id) => sum + getBusinessWorth(id), 0);
  }

  function canHireForBusiness(bizId) {
    const def = BUSINESS_DEFS[bizId];
    const bs = getBusinessState(bizId);
    if (!def.upgrades.some((u) => u.unlocksHiring)) return true;
    return def.upgrades
      .filter((u) => u.unlocksHiring)
      .every((u) => bs.upgrades.indexOf(u.id) !== -1);
  }

  function openBusiness(bizId) {
    const def = BUSINESS_DEFS[bizId];
    const bs = getBusinessState(bizId);
    if (bs.owned) return { ok: false, reason: 'already_owned' };
    if (state.balance < def.startCost) return { ok: false, reason: 'not_enough_money' };

    state.balance -= def.startCost;
    bs.owned = true;
    state.stats.businessesOpened += 1;
    addReputation(5);
    notify('business:opened', bizId);
    notify('state:changed');
    return { ok: true };
  }

  function buyUpgrade(bizId, upgradeId) {
    const def = BUSINESS_DEFS[bizId];
    const bs = getBusinessState(bizId);
    const upgrade = def.upgrades.find((u) => u.id === upgradeId);
    if (!upgrade) return { ok: false, reason: 'not_found' };
    if (bs.upgrades.indexOf(upgradeId) !== -1) return { ok: false, reason: 'already_owned' };

    const idx = def.upgrades.findIndex((u) => u.id === upgradeId);
    if (idx > 0) {
      const prev = def.upgrades[idx - 1];
      if (bs.upgrades.indexOf(prev.id) === -1) return { ok: false, reason: 'locked' };
    }

    let cost = upgrade.cost;
    if (state.nextUpgradeDiscount > 0) {
      cost = Math.round(cost * (1 - state.nextUpgradeDiscount));
      state.nextUpgradeDiscount = 0;
    }

    if (state.balance < cost) return { ok: false, reason: 'not_enough_money' };

    state.balance -= cost;
    bs.upgrades.push(upgradeId);
    state.stats.upgradesBought += 1;
    addReputation(2 + (upgrade.reputation || 0));
    notify('upgrade:bought', { bizId, upgradeId });
    notify('state:changed');
    return { ok: true };
  }

  window.G.businesses = {
    BUSINESS_DEFS,
    getBusinessState,
    isBusinessOwned,
    getOwnedBusinessIds,
    getNextUpgrade,
    getBusinessIncome,
    getBusinessExpense,
    getBusinessWorth,
    getTotalBusinessWorth,
    canHireForBusiness,
    openBusiness,
    buyUpgrade,
  };
})();
