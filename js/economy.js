// =========================================================
// economy.js — дневной цикл (advanceDay), недвижимость, кредиты,
// налоги, агрегированные доход/расход, форматирование чисел
//
// Игра пошаговая: весь расчёт происходит один раз за клик по
// кнопке «Следующий день», а не в реальном времени.
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};
  const S = window.G.state;
  const state = S.state;
  const notify = S.notify;
  const addReputation = S.addReputation;
  const CONFIG = S.CONFIG;

  // ---------------------------------------------------------
  // Форматирование чисел
  // ---------------------------------------------------------
  function formatMoney(value) {
    const sign = value < 0 ? '−' : '';
    const abs = Math.abs(Math.round(value));
    return sign + abs.toLocaleString('ru-RU') + ' ₽';
  }

  function formatMoneyShort(value) {
    const abs = Math.abs(value);
    const sign = value < 0 ? '−' : '';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2).replace(/\.00$/, '') + ' млрд ₽';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2).replace(/\.00$/, '') + ' млн ₽';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1).replace(/\.0$/, '') + ' тыс ₽';
    return sign + Math.round(abs) + ' ₽';
  }

  function formatSigned(value, formatter) {
    formatter = formatter || formatMoney;
    return (value >= 0 ? '+' : '') + formatter(value);
  }

  function formatDays(n) {
    const abs = Math.max(0, Math.round(n));
    const mod10 = abs % 10, mod100 = abs % 100;
    let word = 'дней';
    if (mod100 < 11 || mod100 > 14) {
      if (mod10 === 1) word = 'день';
      else if (mod10 >= 2 && mod10 <= 4) word = 'дня';
    }
    return `${abs} ${word}`;
  }

  // ---------------------------------------------------------
  // Недвижимость
  // ---------------------------------------------------------
  const PROPERTY_DEFS = {
    small_office: {
      id: 'small_office', name: 'Маленький офис', icon: '🏠', cost: 100000,
      incomeBonusPct: 0.05, capacity: 2,
      desc: '+5% ко всему доходу, +2 места для сотрудников',
    },
    big_office: {
      id: 'big_office', name: 'Большой офис', icon: '🏢', cost: 500000,
      incomeBonusPct: 0.08, capacity: 5,
      desc: '+8% ко всему доходу, +5 мест для сотрудников',
    },
    business_center: {
      id: 'business_center', name: 'Бизнес-центр', icon: '🏬', cost: 5000000,
      incomeBonusPct: 0.12, capacity: 10,
      desc: '+12% ко всему доходу, +10 мест для сотрудников',
    },
    skyscraper: {
      id: 'skyscraper', name: 'Небоскрёб', icon: '🏙️', cost: 50000000,
      incomeBonusPct: 0.20, capacity: 25, reputation: 50,
      desc: '+20% ко всему доходу, +25 мест, +50 репутации',
    },
  };

  function isPropertyOwned(id) {
    return !!state.properties[id];
  }

  function buyProperty(id) {
    const def = PROPERTY_DEFS[id];
    if (!def) return { ok: false, reason: 'not_found' };
    if (state.properties[id]) return { ok: false, reason: 'already_owned' };
    if (state.balance < def.cost) return { ok: false, reason: 'not_enough_money' };

    state.balance -= def.cost;
    state.properties[id] = true;
    if (def.reputation) addReputation(def.reputation);
    notify('property:bought', id);
    notify('state:changed');
    return { ok: true };
  }

  function getPropertyIncomeMultiplier() {
    let mult = 1;
    Object.values(PROPERTY_DEFS).forEach((def) => {
      if (state.properties[def.id]) mult += def.incomeBonusPct;
    });
    return mult;
  }

  // ---------------------------------------------------------
  // Временные бусты (из кристального магазина / событий) — считаются в днях
  // ---------------------------------------------------------
  function getActiveIncomeBoostMultiplier() {
    state.boosts = state.boosts.filter((b) => b.expiresDay > state.day);
    let mult = 1;
    state.boosts.forEach((b) => {
      if (b.kind === 'income_mult') mult *= b.value;
    });
    return mult;
  }

  function addBoost(kind, value, durationDays) {
    state.boosts.push({
      id: `${kind}_${state.day}_${Math.random().toString(36).slice(2, 6)}`,
      kind,
      value,
      expiresDay: state.day + durationDays,
    });
    notify('state:changed');
  }

  // ---------------------------------------------------------
  // Агрегированные показатели дохода/расхода — В ДЕНЬ
  // (внутренние def-значения исторически названы "в час", но
  // с пошаговой моделью они пересчитываются в дневные ×24)
  // ---------------------------------------------------------
  function getGrossDailyIncome() {
    const B = window.G.businesses;
    const hours = CONFIG.EFFECTIVE_WORK_HOURS;
    let income = 0;
    Object.keys(B.BUSINESS_DEFS).forEach((id) => { income += B.getBusinessIncome(id) * hours; });
    income += window.G.employees.getEmployeeIncomeTotal() * hours;
    return income;
  }

  function getGrossDailyExpense() {
    const B = window.G.businesses;
    const hours = CONFIG.EFFECTIVE_WORK_HOURS;
    let expense = 0;
    Object.keys(B.BUSINESS_DEFS).forEach((id) => { expense += B.getBusinessExpense(id) * hours; });
    expense += window.G.employees.getEmployeeExpenseTotal() * hours;
    // личное имущество (машины/дома/яхты...) — фиксированное содержание
    // в день, не связанное с рабочими часами бизнеса
    expense += window.G.luxury.getLuxuryUpkeepTotal();
    return expense;
  }

  function getFinalDailyIncome() {
    return getGrossDailyIncome() * getPropertyIncomeMultiplier() * getActiveIncomeBoostMultiplier();
  }

  function getFinalDailyExpense() {
    return getGrossDailyExpense();
  }

  function getNetDailyIncome() {
    return getFinalDailyIncome() - getFinalDailyExpense();
  }

  function getTotalAssetsValue() {
    const B = window.G.businesses;
    let value = 0;
    Object.keys(B.BUSINESS_DEFS).forEach((id) => {
      const bs = state.businesses[id];
      if (bs && bs.owned) {
        value += B.BUSINESS_DEFS[id].startCost;
        B.BUSINESS_DEFS[id].upgrades.forEach((u) => { if (bs.upgrades.indexOf(u.id) !== -1) value += u.cost; });
      }
    });
    Object.keys(PROPERTY_DEFS).forEach((id) => {
      if (state.properties[id]) value += PROPERTY_DEFS[id].cost;
    });
    value += window.G.luxury.getLuxuryValueTotal();
    return value;
  }

  // ---------------------------------------------------------
  // Кредиты (банк) — усложнённые правила, чтобы закрыть схему
  // «взял кредит → мгновенно раскачался»:
  //  - недоступны в первые CREDIT_MIN_DAY дней игры;
  //  - НЕ БОЛЬШЕ ОДНОГО кредита одновременно;
  //  - чистая дневная прибыль должна быть НЕ МЕНЬШЕ дневного
  //    платежа × CREDIT_INCOME_MARGIN (запас, а не просто "больше");
  //  - при оформлении удерживается комиссия — на руки приходит
  //    меньше номинала, а долг считается от полной суммы;
  //  - после закрытия (или списания) кредита действует кулдаун,
  //    прежде чем можно взять следующий;
  //  - серия пропущенных платежей подряд ведёт к дефолту:
  //    долг списывается, но бьёт по репутации и надолго закрывает
  //    доступ к новым кредитам.
  // ---------------------------------------------------------
  const CREDIT_OFFERS = [
    { amount: 100000, rate: 0.08, days: 30 },
    { amount: 300000, rate: 0.08, days: 30 },
    { amount: 500000, rate: 0.10, days: 30 },
    { amount: 1000000, rate: 0.10, days: 45 },
    { amount: 5000000, rate: 0.12, days: 60 },
  ];

  function getOfferDailyPayment(offer) {
    const totalDue = Math.round(offer.amount * (1 + offer.rate));
    return Math.round(totalDue / offer.days);
  }

  function getOfferOriginationFee(offer) {
    return Math.round(offer.amount * CONFIG.CREDIT_ORIGINATION_FEE_PCT);
  }

  function canTakeCredit(offer) {
    if (state.day < CONFIG.CREDIT_MIN_DAY) {
      return { ok: false, reason: 'too_early', availableDay: CONFIG.CREDIT_MIN_DAY };
    }
    if (state.credit) return { ok: false, reason: 'already_has_credit' };
    if (state.day < state.creditCooldownUntilDay) {
      return { ok: false, reason: 'cooldown', availableDay: state.creditCooldownUntilDay };
    }
    const net = getNetDailyIncome();
    const dailyPayment = getOfferDailyPayment(offer);
    const required = dailyPayment * CONFIG.CREDIT_INCOME_MARGIN;
    if (net <= 0 || net < required) {
      return { ok: false, reason: 'income_too_low', dailyPayment, net, required };
    }
    return { ok: true, dailyPayment, net, required, fee: getOfferOriginationFee(offer) };
  }

  function getActiveCreditTotal() {
    return state.credit ? state.credit.remainingAmount : 0;
  }

  function takeCredit(amount) {
    const offer = CREDIT_OFFERS.find((o) => o.amount === amount);
    if (!offer) return { ok: false, reason: 'not_found' };
    const check = canTakeCredit(offer);
    if (!check.ok) return check;

    const totalDue = Math.round(offer.amount * (1 + offer.rate));
    const fee = getOfferOriginationFee(offer);
    const disbursed = offer.amount - fee;

    state.credit = {
      uid: `credit_${state.day}`,
      amount: offer.amount,
      rate: offer.rate,
      days: offer.days,
      dailyPayment: check.dailyPayment,
      startDay: state.day,
      daysPaid: 0,
      remainingAmount: totalDue,
      missedPayments: 0,
      consecutiveMissed: 0,
    };
    state.balance += disbursed;
    notify('credit:taken', { offer, fee, disbursed });
    notify('state:changed');
    return { ok: true, fee, disbursed };
  }

  /** Списывает дневной платёж по кредиту. Возвращает отчёт для UI. */
  function processCreditPayment() {
    if (!state.credit) return { hasCredit: false, missed: false };
    const credit = state.credit;
    const payment = Math.min(credit.dailyPayment, credit.remainingAmount);
    let missed = false;
    let defaulted = false;

    if (state.balance >= payment) {
      state.balance -= payment;
      credit.remainingAmount -= payment;
      credit.daysPaid += 1;
      credit.consecutiveMissed = 0;
    } else {
      missed = true;
      credit.missedPayments += 1;
      credit.consecutiveMissed = (credit.consecutiveMissed || 0) + 1;
      credit.remainingAmount = Math.round(credit.remainingAmount * 1.03);
      addReputation(-4);
      notify('credit:missed', credit);

      if (credit.consecutiveMissed >= CONFIG.CREDIT_DEFAULT_MISSED_LIMIT) {
        defaulted = true;
      }
    }

    let paidOff = false;
    if (defaulted) {
      state.credit = null;
      state.creditCooldownUntilDay = state.day + CONFIG.CREDIT_DEFAULT_COOLDOWN_DAYS;
      state.stats.creditsDefaulted += 1;
      addReputation(CONFIG.CREDIT_DEFAULT_REPUTATION_PENALTY);
      notify('credit:defaulted', credit);
    } else if (credit.remainingAmount <= 0) {
      state.credit = null;
      state.creditCooldownUntilDay = state.day + CONFIG.CREDIT_COOLDOWN_DAYS;
      paidOff = true;
      notify('credit:paidoff');
    }

    return { hasCredit: true, missed, paidOff, defaulted, payment: missed ? 0 : payment };
  }

  /** Досрочное полное погашение кредита игроком (кнопка в банке).
   *  Комиссия ниже, чем накопленная бы за оставшиеся дни, а кулдаун
   *  короче обычного — стимул не тянуть с закрытием долга. */
  function repayCreditEarly() {
    if (!state.credit) return { ok: false, reason: 'no_credit' };
    const credit = state.credit;
    const fee = Math.round(credit.remainingAmount * CONFIG.CREDIT_EARLY_REPAY_FEE_PCT);
    const totalCost = credit.remainingAmount + fee;
    if (state.balance < totalCost) return { ok: false, reason: 'not_enough_money', totalCost, fee };

    state.balance -= totalCost;
    state.credit = null;
    state.creditCooldownUntilDay = state.day + CONFIG.CREDIT_EARLY_REPAY_COOLDOWN_DAYS;
    notify('credit:paidoff');
    notify('state:changed');
    return { ok: true, totalCost, fee };
  }

  // ---------------------------------------------------------
  // Налог — прогрессивная шкала от текущего дневного дохода,
  // начисляется раз в CONFIG.TAX_INTERVAL_DAYS дней
  // ---------------------------------------------------------
  function getTaxBracket(dailyIncome) {
    return CONFIG.TAX_BRACKETS.find((b) => dailyIncome <= b.max) || CONFIG.TAX_BRACKETS[CONFIG.TAX_BRACKETS.length - 1];
  }

  function isTaxDay(dayNumber) {
    return dayNumber % CONFIG.TAX_INTERVAL_DAYS === 0;
  }

  /** Списывает налог сразу деньгами (по умолчанию). Кристальная
   *  компенсация предлагается отдельно из UI сразу после начисления. */
  function chargeTax(dailyIncome) {
    const bracket = getTaxBracket(dailyIncome);
    const amount = Math.round(dailyIncome * bracket.rate);
    if (amount <= 0) return null;
    state.balance -= amount;
    state.totalTaxPaid += amount;
    state.stats.taxCyclesPaid += 1;
    notify('tax:charged', { amount, rate: bracket.rate });
    return { amount, rate: bracket.rate, paidWithCrystals: false };
  }

  /** Позволяет игроку постфактум заменить списание деньгами на кристаллы
   *  (вызывается из модалки итогов дня, пока отчёт ещё актуален). */
  function refundTaxAndPayWithCrystals(amount) {
    const crystalCost = Math.max(1, Math.ceil(amount / CONFIG.CRYSTAL_PER_TAX_RUB));
    if (state.crystals < crystalCost) return { ok: false, reason: 'not_enough_crystals', crystalCost };
    state.crystals -= crystalCost;
    state.balance += amount; // возвращаем ранее списанные деньги
    state.totalTaxPaid = Math.max(0, state.totalTaxPaid - amount);
    notify('state:changed');
    return { ok: true, crystalCost };
  }

  function getTaxCrystalCost(amount) {
    return Math.max(1, Math.ceil(amount / CONFIG.CRYSTAL_PER_TAX_RUB));
  }

  // ---------------------------------------------------------
  // ГЛАВНАЯ ФУНКЦИЯ: продвинуть игру на один день вперёд
  // ---------------------------------------------------------
  function advanceDay() {
    const dayNumber = state.day;
    const P = window.G.player;

    const burnout = P.wasBurnoutAtStartOfDay();
    const grossIncome = getFinalDailyIncome();
    const grossExpense = getFinalDailyExpense();
    const income = burnout ? 0 : grossIncome;
    const expense = grossExpense;

    state.balance += income;
    state.balance -= expense;
    state.totalEarned += Math.max(0, income);
    state.totalExpenses += Math.max(0, expense);

    const creditReport = processCreditPayment();

    const healthBefore = { health: state.health, nutrition: state.nutrition, mood: state.mood };
    P.applyDailyDecay(income - expense, creditReport.missed);
    const jobReport = P.consumeJobForDay();
    const healthAfter = { health: state.health, nutrition: state.nutrition, mood: state.mood };

    let taxReport = null;
    if (isTaxDay(dayNumber)) {
      taxReport = chargeTax(income);
    }

    const eventReport = window.G.events.maybeTriggerEvent();
    const investmentsResolved = window.G.investments.resolveMaturedInvestments();

    if (state.balance > state.maxBalance) state.maxBalance = state.balance;

    const history = state.balanceHistory;
    history.push({ day: dayNumber, v: Math.round(state.balance) });
    if (history.length > CONFIG.MAX_BALANCE_HISTORY) history.shift();

    window.G.achievements.checkAchievements();

    state.day = dayNumber + 1;

    const report = {
      day: dayNumber,
      burnout,
      income,
      expense,
      net: income - expense,
      credit: creditReport,
      tax: taxReport,
      event: eventReport,
      investmentsResolved,
      health: healthBefore,
      healthAfter,
      job: jobReport,
    };

    notify('day:advanced', report);
    notify('state:changed');
    return report;
  }

  window.G.economy = {
    formatMoney,
    formatMoneyShort,
    formatSigned,
    formatDays,
    PROPERTY_DEFS,
    isPropertyOwned,
    buyProperty,
    getPropertyIncomeMultiplier,
    getActiveIncomeBoostMultiplier,
    addBoost,
    CREDIT_OFFERS,
    getOfferDailyPayment,
    getOfferOriginationFee,
    canTakeCredit,
    getActiveCreditTotal,
    takeCredit,
    repayCreditEarly,
    getTaxBracket,
    isTaxDay,
    getTaxCrystalCost,
    refundTaxAndPayWithCrystals,
    getGrossDailyIncome,
    getGrossDailyExpense,
    getFinalDailyIncome,
    getFinalDailyExpense,
    getNetDailyIncome,
    getTotalAssetsValue,
    advanceDay,
  };
})();
