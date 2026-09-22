// =========================================================
// investments.js — инвестиционные продукты: акции, недвижимость,
// собственный бизнес, стартапы. Срок считается в игровых днях.
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};
  const S = window.G.state;
  const state = S.state;
  const notify = S.notify;
  const addReputation = S.addReputation;

  const INVESTMENT_DEFS = {
    stocks_blue: {
      id: 'stocks_blue', name: 'Голубые фишки', icon: '📊',
      minAmount: 10000, returnPct: 0.15, days: 3, risk: 'low',
      successChance: 0.88, failPct: 0.05,
      desc: 'Акции крупных стабильных компаний. Низкий риск, скромная доходность.',
    },
    stocks_tech: {
      id: 'stocks_tech', name: 'Технологические акции', icon: '💹',
      minAmount: 25000, returnPct: 0.35, days: 5, risk: 'medium',
      successChance: 0.68, failPct: 0.15,
      desc: 'Быстрорастущие технологические компании. Средний риск.',
    },
    real_estate: {
      id: 'real_estate', name: 'Инвестиции в недвижимость', icon: '🏘️',
      minAmount: 200000, returnPct: 0.20, days: 8, risk: 'low',
      successChance: 0.93, failPct: 0.04,
      desc: 'Вложение в жилую недвижимость под сдачу и перепродажу.',
    },
    startup: {
      id: 'startup', name: 'Стартап', icon: '🚀',
      minAmount: 100000, returnPct: 0.90, days: 6, risk: 'high',
      successChance: 0.48, failPct: 0.45,
      desc: 'Вложение в молодую компанию. Высокий риск, высокая потенциальная прибыль.',
    },
  };

  function getActiveInvestments() {
    return state.investments.filter((i) => !i.resolved);
  }

  function startInvestment(typeId, amount) {
    const def = INVESTMENT_DEFS[typeId];
    if (!def) return { ok: false, reason: 'not_found' };
    if (amount < def.minAmount) return { ok: false, reason: 'below_min' };
    if (state.balance < amount) return { ok: false, reason: 'not_enough_money' };

    state.balance -= amount;
    state.investments.push({
      uid: `inv_${state.day}_${Math.random().toString(36).slice(2, 7)}`,
      typeId,
      amount,
      startDay: state.day,
      matureDay: state.day + def.days,
      resolved: false,
    });
    notify('investment:started', { typeId, amount });
    notify('state:changed');
    return { ok: true };
  }

  /** Проверяет все активные инвестиции и завершает созревшие.
   *  Вызывается один раз за advanceDay(). */
  function resolveMaturedInvestments() {
    const resolved = [];
    state.investments.forEach((inv) => {
      if (inv.resolved) return;
      if (state.day < inv.matureDay) return;

      const def = INVESTMENT_DEFS[inv.typeId];
      const success = Math.random() < def.successChance;
      let payout;
      if (success) {
        payout = Math.round(inv.amount * (1 + def.returnPct));
        addReputation(2);
      } else {
        payout = Math.round(inv.amount * (1 - def.failPct));
      }
      state.balance += payout;
      inv.resolved = true;
      inv.success = success;
      inv.payout = payout;
      resolved.push(inv);
    });
    if (resolved.length) {
      notify('investment:resolved', resolved);
      notify('state:changed');
    }
    return resolved;
  }

  function getInvestmentProgress(inv) {
    const total = inv.matureDay - inv.startDay;
    const elapsed = state.day - inv.startDay;
    return Math.min(1, Math.max(0, total > 0 ? elapsed / total : 1));
  }

  function getInvestmentDaysLeft(inv) {
    return Math.max(0, inv.matureDay - state.day);
  }

  window.G.investments = {
    INVESTMENT_DEFS,
    getActiveInvestments,
    startInvestment,
    resolveMaturedInvestments,
    getInvestmentProgress,
    getInvestmentDaysLeft,
  };
})();
