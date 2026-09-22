// =========================================================
// player.js — здоровье, питание, настроение бизнесмена.
// Жёсткая механика: если здоровье падает до 0 — наступает
// "выгорание", бизнес в этот день не приносит дохода вообще,
// пока здоровье не будет восстановлено (покупкой или кристаллами).
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};
  const S = window.G.state;
  const state = S.state;
  const CONFIG = S.CONFIG;
  const notify = S.notify;

  function clamp100(v) {
    return Math.max(0, Math.min(100, v));
  }

  function isBurnout() {
    return state.health <= 0;
  }

  /** Вызывается один раз за advanceDay(), ДО расчёта дохода —
   *  чтобы решить, работал ли бизнес в этот день. */
  function wasBurnoutAtStartOfDay() {
    return isBurnout();
  }

  /** Ежедневное изменение показателей. netDailyIncome передаётся
   *  из economy.js, чтобы настроение реагировало на убытки. */
  function applyDailyDecay(netDailyIncome, creditMissed) {
    // Питание падает каждый день — герою нужно есть
    state.nutrition = clamp100(state.nutrition - CONFIG.NUTRITION_DECAY_PER_DAY);

    // Настроение: базовое падение + стресс от убытков/долгов
    let moodDelta = -CONFIG.MOOD_DECAY_PER_DAY;
    if (netDailyIncome < 0) moodDelta -= CONFIG.MOOD_DECAY_NEGATIVE_INCOME;
    if (creditMissed) moodDelta -= CONFIG.MOOD_DECAY_MISSED_PAYMENT;
    state.mood = clamp100(state.mood + moodDelta);

    // Здоровье: голод бьёт сильно, низкое настроение усиливает истощение,
    // иначе — небольшая естественная регенерация
    let healthDelta = 0;
    if (state.nutrition <= 0) healthDelta -= CONFIG.NUTRITION_STARVE_HEALTH_PENALTY;
    if (state.mood <= 0) healthDelta -= CONFIG.HEALTH_DECAY_LOW_MOOD;
    if (state.nutrition > 0 && state.mood > 0) healthDelta += CONFIG.HEALTH_REGEN_PER_DAY;
    state.health = clamp100(state.health + healthDelta);

    if (state.health <= 0) {
      state.burnoutDays += 1;
      if (state.burnoutDays === 1) {
        state.stats.burnoutEvents += 1;
        notify('player:burnout');
      }
    } else {
      state.burnoutDays = 0;
    }

    notify('state:changed');
  }

  // ---------------------------------------------------------
  // Действия восстановления (покупаются за деньги)
  // ---------------------------------------------------------
  const RESTORE_ACTIONS = {
    meal: {
      id: 'meal', name: 'Обед', icon: '🍔', cost: 500,
      effect: { nutrition: 25 }, desc: '+25 к питанию',
    },
    restaurant: {
      id: 'restaurant', name: 'Ресторан', icon: '🍽️', cost: 2000,
      effect: { nutrition: 100 }, desc: 'Полностью восстанавливает питание',
    },
    rest: {
      id: 'rest', name: 'Отдых', icon: '🛌', cost: 3000,
      effect: { mood: 25 }, desc: '+25 к настроению',
    },
    vacation: {
      id: 'vacation', name: 'Отпуск', icon: '🏖️', cost: 15000,
      effect: { mood: 60, health: 15 }, desc: '+60 к настроению, +15 к здоровью',
    },
    treatment: {
      id: 'treatment', name: 'Лечение', icon: '💊', cost: 8000,
      effect: { health: 50 }, desc: '+50 к здоровью — снимает выгорание',
    },
  };

  function buyRestoreAction(id) {
    const def = RESTORE_ACTIONS[id];
    if (!def) return { ok: false, reason: 'not_found' };
    if (state.balance < def.cost) return { ok: false, reason: 'not_enough_money' };

    state.balance -= def.cost;
    if (def.effect.nutrition) state.nutrition = clamp100(state.nutrition + def.effect.nutrition);
    if (def.effect.mood) state.mood = clamp100(state.mood + def.effect.mood);
    if (def.effect.health) state.health = clamp100(state.health + def.effect.health);
    if (state.health > 0) state.burnoutDays = 0;

    notify('player:restored', def);
    notify('state:changed');
    return { ok: true };
  }

  /** Полное восстановление всех показателей за кристаллы. */
  function fullRestoreWithCrystals() {
    if (state.crystals < CONFIG.CRYSTAL_FULL_RESTORE_COST) return { ok: false, reason: 'not_enough_crystals' };
    state.crystals -= CONFIG.CRYSTAL_FULL_RESTORE_COST;
    state.health = 100;
    state.nutrition = 100;
    state.mood = 100;
    state.burnoutDays = 0;
    notify('player:restored', { name: 'Полное восстановление' });
    notify('state:changed');
    return { ok: true };
  }

  // ---------------------------------------------------------
  // Подработки — гарантированный доход без бизнеса, но с ценой
  // для здоровья/питания/настроения. Выбираются на один день,
  // сбрасываются после advanceDay(). Полезны в начале игры и
  // как страховка при просадке дохода от бизнеса.
  // ---------------------------------------------------------
  const JOB_DEFS = {
    courier: {
      id: 'courier', name: 'Курьер', icon: '🚴',
      pay: 1500, cost: { nutrition: 15, mood: 5 },
      desc: 'Доставка заказов по городу',
    },
    callcenter: {
      id: 'callcenter', name: 'Оператор колл-центра', icon: '📞',
      pay: 1200, cost: { mood: 15 },
      desc: 'Обзвон клиентов — просто, но выматывает морально',
    },
    loader: {
      id: 'loader', name: 'Грузчик', icon: '📦',
      pay: 2200, cost: { nutrition: 20, health: 5 },
      desc: 'Тяжёлая физическая работа за хорошую плату',
    },
    waiter: {
      id: 'waiter', name: 'Официант', icon: '🍽️',
      pay: 1800, cost: { nutrition: 10, mood: 10 },
      minReputation: 5,
      desc: 'Нужна минимальная репутация, платят с чаевыми',
    },
    security: {
      id: 'security', name: 'Охранник', icon: '🛡️',
      pay: 2600, cost: { mood: 20, health: 5 },
      minReputation: 15,
      desc: 'Ночные смены — хорошо платят, сильно утомляют',
    },
  };

  function canWorkJob(id) {
    const def = JOB_DEFS[id];
    if (!def) return { ok: false, reason: 'not_found' };
    if (isBurnout()) return { ok: false, reason: 'burnout' };
    if (def.minReputation && state.reputation < def.minReputation) {
      return { ok: false, reason: 'low_reputation', need: def.minReputation };
    }
    return { ok: true };
  }

  /** Выбрать подработку на текущий (ещё не завершённый) день. */
  function selectJob(id) {
    if (id === null) {
      state.selectedJob = null;
      notify('state:changed');
      return { ok: true };
    }
    const check = canWorkJob(id);
    if (!check.ok) return check;
    state.selectedJob = id;
    notify('state:changed');
    return { ok: true };
  }

  /** Вызывается из economy.advanceDay(): начисляет оплату за подработку
   *  и списывает её "цену" сверх обычного дневного decay. Возвращает
   *  отчёт для модалки итогов дня (или null, если подработка не выбрана). */
  function consumeJobForDay() {
    const id = state.selectedJob;
    state.selectedJob = null; // подработку нужно выбирать каждый день заново
    if (!id) return null;
    const def = JOB_DEFS[id];
    if (!def) return null;
    const check = canWorkJob(id);
    if (!check.ok) return null; // например, наступило выгорание в этот же день

    state.balance += def.pay;
    state.totalEarned += def.pay;
    state.stats.daysWorked += 1;

    if (def.cost.nutrition) state.nutrition = clamp100(state.nutrition - def.cost.nutrition);
    if (def.cost.mood) state.mood = clamp100(state.mood - def.cost.mood);
    if (def.cost.health) state.health = clamp100(state.health - def.cost.health);

    notify('player:worked', def);
    return { id, name: def.name, icon: def.icon, pay: def.pay, cost: def.cost };
  }

  window.G.player = {
    RESTORE_ACTIONS,
    JOB_DEFS,
    isBurnout,
    wasBurnoutAtStartOfDay,
    applyDailyDecay,
    buyRestoreAction,
    fullRestoreWithCrystals,
    canWorkJob,
    selectJob,
    consumeJobForDay,
  };
})();
