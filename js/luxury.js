// =========================================================
// luxury.js — личное имущество (машины, дома, яхты, острова...)
//
// Отдельно от коммерческой недвижимости (economy.js/PROPERTY_DEFS):
// это статусные покупки, которые НЕ приносят дохода, а только
// ежедневное содержание (upkeep) + разовую репутацию. Покупка
// без оглядки на содержание — реальный способ уйти в минус:
// upkeep суммируется в общие дневные расходы наравне с зарплатами.
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};
  const S = window.G.state;
  const state = S.state;
  const notify = S.notify;
  const addReputation = S.addReputation;

  const LUXURY_DEFS = {
    cars: {
      label: 'Транспорт',
      items: [
        { id: 'used_car', name: 'Подержанная машина', icon: '🚗', cost: 15000, upkeep: 150, reputation: 2, desc: 'Простой городской автомобиль' },
        { id: 'new_car', name: 'Новая машина', icon: '🚙', cost: 60000, upkeep: 400, reputation: 5, minReputation: 10, desc: 'Комфортный кроссовер' },
        { id: 'sport_car', name: 'Спорткар', icon: '🏎️', cost: 350000, upkeep: 1800, reputation: 15, minReputation: 30, desc: 'Статусная вещь, но дорогая в обслуживании' },
        { id: 'supercar', name: 'Суперкар', icon: '🚘', cost: 2200000, upkeep: 9000, reputation: 40, minReputation: 80, desc: 'Для тех, кто уже очень крепко стоит на ногах' },
      ],
    },
    housing: {
      label: 'Недвижимость',
      items: [
        { id: 'apartment', name: 'Своя квартира', icon: '🏠', cost: 40000, upkeep: 300, reputation: 3, desc: 'Больше не нужно снимать жильё' },
        { id: 'house', name: 'Загородный дом', icon: '🏡', cost: 220000, upkeep: 1200, reputation: 10, minReputation: 20, desc: 'Дом за городом с участком' },
        { id: 'mansion', name: 'Особняк', icon: '🏰', cost: 1600000, upkeep: 6000, reputation: 30, minReputation: 60, desc: 'Серьёзная заявка на статус' },
        { id: 'penthouse', name: 'Пентхаус', icon: '🌆', cost: 5500000, upkeep: 18000, reputation: 60, minReputation: 120, desc: 'Вид на весь город с верхнего этажа' },
      ],
    },
    watercraft: {
      label: 'Водный транспорт',
      items: [
        { id: 'boat', name: 'Катер', icon: '🚤', cost: 180000, upkeep: 900, reputation: 8, minReputation: 15, desc: 'Прогулки по выходным' },
        { id: 'yacht', name: 'Яхта', icon: '🛥️', cost: 1800000, upkeep: 7000, reputation: 35, minReputation: 70, desc: 'Швартовка, экипаж, топливо — недёшево' },
        { id: 'superyacht', name: 'Суперяхта', icon: '🚢', cost: 9000000, upkeep: 28000, reputation: 80, minReputation: 160, desc: 'Плавучий особняк с командой на борту' },
      ],
    },
    exclusive: {
      label: 'Эксклюзив',
      items: [
        { id: 'private_jet', name: 'Частный самолёт', icon: '✈️', cost: 12000000, upkeep: 40000, reputation: 100, minReputation: 180, desc: 'Аэропорт больше не нужен — только ВПП' },
        { id: 'island', name: 'Частный остров', icon: '🏝️', cost: 40000000, upkeep: 120000, reputation: 200, minReputation: 250, desc: 'Вершина статуса — целый остров в собственности' },
      ],
    },
  };

  function allItems() {
    return Object.values(LUXURY_DEFS).reduce((acc, cat) => acc.concat(cat.items), []);
  }

  function findItem(id) {
    return allItems().find((it) => it.id === id) || null;
  }

  function isLuxuryOwned(id) {
    return !!state.luxury[id];
  }

  function canBuyLuxury(id) {
    const item = findItem(id);
    if (!item) return { ok: false, reason: 'not_found' };
    if (state.luxury[id]) return { ok: false, reason: 'already_owned' };
    if (item.minReputation && state.reputation < item.minReputation) {
      return { ok: false, reason: 'low_reputation', need: item.minReputation };
    }
    if (state.balance < item.cost) return { ok: false, reason: 'not_enough_money' };
    return { ok: true };
  }

  function buyLuxury(id) {
    const check = canBuyLuxury(id);
    if (!check.ok) return check;
    const item = findItem(id);

    state.balance -= item.cost;
    state.luxury[id] = true;
    if (item.reputation) addReputation(item.reputation);
    notify('luxury:bought', item);
    notify('state:changed');
    return { ok: true };
  }

  /** Суммарное ежедневное содержание всего купленного личного имущества.
   *  Считается уже "в день" — без множителя эффективных часов бизнеса,
   *  как обычная фиксированная статья расходов (аренда, топливо, страховка). */
  function getLuxuryUpkeepTotal() {
    return allItems().reduce((sum, item) => sum + (state.luxury[item.id] ? item.upkeep : 0), 0);
  }

  function getOwnedLuxuryIds() {
    return Object.keys(state.luxury).filter((id) => state.luxury[id]);
  }

  function getLuxuryValueTotal() {
    return allItems().reduce((sum, item) => sum + (state.luxury[item.id] ? item.cost : 0), 0);
  }

  window.G.luxury = {
    LUXURY_DEFS,
    findItem,
    isLuxuryOwned,
    canBuyLuxury,
    buyLuxury,
    getLuxuryUpkeepTotal,
    getOwnedLuxuryIds,
    getLuxuryValueTotal,
  };
})();
