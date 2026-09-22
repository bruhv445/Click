// =========================================================
// ui.js — рендеринг экранов, модальных окон, уведомлений,
// анимаций. Единственный модуль, который трогает DOM.
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};

  const S = window.G.state;
  const state = S.state;
  const on = S.on;
  const getReputationLevel = S.getReputationLevel;
  const addCrystals = S.addCrystals;
  const CONFIG = S.CONFIG;

  const B = window.G.businesses;
  const {
    BUSINESS_DEFS, getBusinessState, isBusinessOwned, getNextUpgrade,
    getBusinessIncome, getBusinessExpense, openBusiness, buyUpgrade,
    getOwnedBusinessIds,
  } = B;

  const Emp = window.G.employees;
  const {
    EMPLOYEE_DEFS, getEmployeeCount, getTotalEmployeeCount, getEmployeeCapacity,
    hireEmployee, canHireMore,
  } = Emp;

  const Econ = window.G.economy;
  const {
    PROPERTY_DEFS, isPropertyOwned, buyProperty, CREDIT_OFFERS,
    getOfferDailyPayment, canTakeCredit, takeCredit,
    getActiveCreditTotal, formatMoney, formatMoneyShort, formatSigned, formatDays,
    getFinalDailyIncome, getFinalDailyExpense, getNetDailyIncome, getTotalAssetsValue,
    getPropertyIncomeMultiplier, getTaxCrystalCost, refundTaxAndPayWithCrystals, advanceDay,
  } = Econ;

  const Inv = window.G.investments;
  const {
    INVESTMENT_DEFS, getActiveInvestments, startInvestment, getInvestmentProgress,
    getInvestmentDaysLeft,
  } = Inv;

  const Ach = window.G.achievements;
  const { ACHIEVEMENT_DEFS, getUnlockedCount } = Ach;

  const Player = window.G.player;
  const Lux = window.G.luxury;

  function requestRewardedAd() { window.G.app.requestRewardedAd(); }

  let currentScreen = 'dashboard';
  const mainEl = () => document.getElementById('main-content');

  // ===================================================================
  // НАВИГАЦИЯ
  // ===================================================================
  function initNav() {
    document.querySelectorAll('.bottomnav__btn').forEach((btn) => {
      btn.addEventListener('click', () => setScreen(btn.dataset.screen));
    });
    document.getElementById('btn-crystals').addEventListener('click', () => openCrystalShop());
    document.getElementById('btn-next-day').addEventListener('click', () => handleNextDay());
  }

  function setScreen(screen) {
    currentScreen = screen;
    document.querySelectorAll('.bottomnav__btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.screen === screen);
    });
    render();
    mainEl().scrollTop = 0;
  }

  function render() {
    switch (currentScreen) {
      case 'dashboard': return renderDashboard();
      case 'businesses': return renderBusinesses();
      case 'employees': return renderEmployees();
      case 'property': return renderProperty();
      case 'invest': return renderInvest();
      case 'more': return renderMore();
      case 'bank': return renderBank();
      case 'jobs': return renderJobs();
      case 'luxury': return renderLuxury();
      case 'achievements': return renderAchievements();
      case 'stats': return renderStats();
      case 'devmap': return renderDevMap();
      default: return renderDashboard();
    }
  }

  // ===================================================================
  // СЛЕДУЮЩИЙ ДЕНЬ
  // ===================================================================
  function handleNextDay() {
    if (!state.onboarded) {
      showNotification('warn', '⚠️', 'Сначала выбери первый бизнес');
      return;
    }
    const report = advanceDay();
    render();
    renderStatStrip();
    openDaySummaryModal(report);
    window.G.save.saveGame();
  }

  // ===================================================================
  // СТАТСТРИП (верхняя панель показателей)
  // ===================================================================
  function renderStatStrip() {
    const income = getFinalDailyIncome();
    const expense = getFinalDailyExpense();
    const net = income - expense;
    const repLevel = getReputationLevel(state.reputation);

    setText('stat-balance', formatMoney(state.balance));
    setText('stat-income', formatSigned(income));
    setText('stat-expense', '−' + formatMoney(expense).replace('−', ''));
    const netEl = document.getElementById('stat-net');
    netEl.textContent = formatSigned(net);
    netEl.classList.toggle('is-positive', net >= 0);
    netEl.classList.toggle('is-negative', net < 0);

    setText('stat-worth', formatMoney(getTotalAssetsValue()));
    setText('stat-rep', `${Math.round(state.reputation)} — ${repLevel.name}`);
    setText('crystal-count', state.crystals);
    setText('day-bar-num', state.day);

    const dayBar = document.getElementById('day-bar');
    if (dayBar) dayBar.style.display = state.onboarded ? 'flex' : 'none';
    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.toggle('app--no-daybar', !state.onboarded);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ===================================================================
  // ВИТАЛЬНЫЕ ПОКАЗАТЕЛИ (здоровье/питание/настроение)
  // ===================================================================
  function vitalColor(value) {
    if (value <= 20) return 'var(--danger)';
    if (value <= 50) return 'var(--warn)';
    return 'var(--income)';
  }

  function vitalsHtml() {
    const items = [
      { key: 'health', icon: '❤️', label: 'Здоровье', value: state.health },
      { key: 'nutrition', icon: '🍎', label: 'Питание', value: state.nutrition },
      { key: 'mood', icon: '🙂', label: 'Настроение', value: state.mood },
    ];
    return items.map((it) => `
      <div class="vital-row">
        <div class="vital-icon">${it.icon}</div>
        <div class="vital-body">
          <div class="vital-head"><span>${it.label}</span><b>${Math.round(it.value)}/100</b></div>
          <div class="vital-track"><div class="vital-fill" style="width:${it.value}%; background:${vitalColor(it.value)}"></div></div>
        </div>
      </div>
    `).join('');
  }

  function burnoutBannerHtml() {
    if (state.health > 0) return '';
    return `
      <div class="burnout-banner">
        <div class="burnout-banner__icon">🔥</div>
        <div style="flex:1;">
          <div class="burnout-banner__title">Выгорание!</div>
          <div class="burnout-banner__desc">Здоровье на нуле — бизнес не приносит дохода, пока ты не восстановишься.</div>
        </div>
        <button class="btn btn-danger btn-sm" id="btn-emergency-restore">Лечиться</button>
      </div>
    `;
  }

  function wireVitalsPanel(root) {
    const emergencyBtn = root.querySelector('#btn-emergency-restore');
    if (emergencyBtn) emergencyBtn.addEventListener('click', () => openRestoreModal());
    const manageBtn = root.querySelector('#btn-manage-vitals');
    if (manageBtn) manageBtn.addEventListener('click', () => openRestoreModal());
    const quickMeal = root.querySelector('#btn-quick-meal');
    if (quickMeal) quickMeal.addEventListener('click', () => quickRestore('meal'));
    const quickRest = root.querySelector('#btn-quick-rest');
    if (quickRest) quickRest.addEventListener('click', () => quickRestore('rest'));
  }

  function quickRestore(id) {
    const def = Player.RESTORE_ACTIONS[id];
    const result = Player.buyRestoreAction(id);
    if (result.ok) {
      showNotification('success', def.icon, `${def.name}: ${def.desc}`);
      render();
    } else if (result.reason === 'not_enough_money') {
      showNotification('warn', '⚠️', 'Недостаточно денег');
    }
  }

  // ===================================================================
  // ГЛАВНЫЙ ЭКРАН
  // ===================================================================
  function renderDashboard() {
    if (!state.onboarded) return renderWelcome();

    const owned = getOwnedBusinessIds();
    const repLevel = getReputationLevel(state.reputation);

    mainEl().innerHTML = `
      ${burnoutBannerHtml()}

      <div class="panel">
        <div class="section-heading">Твоё состояние</div>
        ${vitalsHtml()}
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button class="btn btn-ghost btn-sm" id="btn-quick-meal" style="flex:1;">🍔 Обед (${formatMoney(Player.RESTORE_ACTIONS.meal.cost)})</button>
          <button class="btn btn-ghost btn-sm" id="btn-quick-rest" style="flex:1;">🛌 Отдых (${formatMoney(Player.RESTORE_ACTIONS.rest.cost)})</button>
        </div>
        <button class="btn btn-ghost btn-sm" id="btn-manage-vitals" style="width:100%; margin-top:8px;">Все варианты восстановления</button>
      </div>

      <div class="bonus-banner" data-goto-jobs="1">
        <div class="bonus-banner__icon">💼</div>
        <div class="bonus-banner__text">
          <div class="bonus-banner__title">${state.selectedJob ? `Подработка на сегодня: ${Player.JOB_DEFS[state.selectedJob].name}` : 'Подработка на сегодня'}</div>
          <div class="bonus-banner__desc">${state.selectedJob ? 'Сработает при переходе на следующий день' : 'Гарантированный доход без бизнеса — ценой сил и здоровья'}</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="btn-go-jobs">${state.selectedJob ? 'Изменить' : 'Выбрать'}</button>
      </div>

      <div class="bonus-banner">
        <div class="bonus-banner__icon">🎁</div>
        <div class="bonus-banner__text">
          <div class="bonus-banner__title">Получить бонус</div>
          <div class="bonus-banner__desc">Посмотри рекламу и получи +5 кристаллов — кристаллы можно получить только так</div>
        </div>
        <button class="btn btn-crystal btn-sm" id="btn-watch-ad">Смотреть</button>
      </div>

      <div class="panel">
        <div class="section-heading">Статус компании</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:13px; color:var(--text-dim);">${repLevel.name}</span>
          <span style="font-size:12px; color:var(--text-faint);">${Math.round(state.reputation)} репутации</span>
        </div>
        <div class="progress"><div class="progress__bar" style="width:${repProgressPct()}%"></div></div>
        <div class="tag-row">
          <span class="tag">🏢 Бизнесов: ${owned.length}</span>
          <span class="tag">👥 Сотрудников: ${getTotalEmployeeCount()}</span>
          <span class="tag">🏠 Объектов: ${Object.keys(state.properties).length}</span>
          <span class="tag">📅 День: ${state.day}</span>
          ${Lux.getLuxuryUpkeepTotal() > 0 ? `<span class="tag" style="color:var(--expense);">💸 Содержание имущества: ${formatMoney(Lux.getLuxuryUpkeepTotal())}/день</span>` : ''}
        </div>
      </div>

      ${owned.length === 0 ? `
        <div class="panel empty-state">
          <div class="empty-state__icon">🚀</div>
          <div class="empty-state__text">У тебя пока нет бизнеса.<br>Перейди во вкладку «Бизнесы», чтобы начать.</div>
          <div style="height:12px;"></div>
          <button class="btn btn-primary" id="btn-go-business">Выбрать первый бизнес</button>
        </div>
      ` : `
        <div class="section-heading">Твои бизнесы</div>
        <div class="card-grid">
          ${owned.map((id) => miniBusinessCard(id)).join('')}
        </div>
      `}

      ${state.credit ? `
        <div class="section-heading">Активный кредит</div>
        <div class="credit-active">
          <div style="display:flex; justify-content:space-between;">
            <b>${formatMoney(state.credit.amount)}</b>
            <span style="color:var(--expense); font-size:12.5px;">Осталось: ${formatMoney(state.credit.remainingAmount)}</span>
          </div>
          <div style="font-size:11.5px; color:var(--text-dim); margin-top:4px;">Платёж в день: ${formatMoney(state.credit.dailyPayment)}${state.credit.missedPayments ? ` · Пропущено платежей: ${state.credit.missedPayments}` : ''}</div>
        </div>
      ` : ''}
    `;

    wireVitalsPanel(mainEl());

    const adBtn = document.getElementById('btn-watch-ad');
    if (adBtn) adBtn.addEventListener('click', () => requestRewardedAd());

    const goBiz = document.getElementById('btn-go-business');
    if (goBiz) goBiz.addEventListener('click', () => setScreen('businesses'));

    const goJobs = document.getElementById('btn-go-jobs');
    if (goJobs) goJobs.addEventListener('click', () => setScreen('jobs'));
  }

  function repProgressPct() {
    const level = getReputationLevel(state.reputation);
    if (level.max === Infinity) return 100;
    const span = level.max - level.min;
    const done = state.reputation - level.min;
    return Math.max(4, Math.min(100, (done / span) * 100));
  }

  function miniBusinessCard(id) {
    const def = BUSINESS_DEFS[id];
    const income = getBusinessIncome(id) * 24;
    const expense = getBusinessExpense(id) * 24;
    return `
      <div class="biz-card" data-goto-business="${id}">
        <div class="biz-card__top">
          <div class="biz-card__icon">${def.icon}</div>
          <div>
            <div class="biz-card__title">${def.name}</div>
            <div class="biz-card__desc">Уровень ${getBusinessState(id).upgrades.length}/${def.upgrades.length}</div>
          </div>
        </div>
        <div class="biz-card__stats">
          <div class="biz-card__stat income">Доход <b>+${formatMoneyShort(income)}/день</b></div>
          <div class="biz-card__stat expense">Расход <b>−${formatMoneyShort(expense)}/день</b></div>
        </div>
      </div>
    `;
  }

  function renderWelcome() {
    mainEl().innerHTML = `
      <div class="welcome">
        <div class="welcome__icon">
          <svg viewBox="0 0 24 24" width="64" height="64"><path fill="#5b8dff" d="M12 2 3 9l9 13 9-13-9-7Z" opacity=".2"/><rect x="4" y="12" width="4" height="9" rx="1" fill="#38e296"/><rect x="10" y="8" width="4" height="13" rx="1" fill="#5b8dff"/><rect x="16" y="4" width="4" height="17" rx="1" fill="#7c5bff"/></svg>
        </div>
        <div class="welcome__title">Ты начинаешь с нуля</div>
        <div class="welcome__text">
          У тебя нет офиса, сотрудников и капитала.<br>
          Твоя задача — построить собственную бизнес-империю.<br><br>
          Выбери свой первый способ заработка:
        </div>
        <div class="welcome__choices">
          ${Object.values(BUSINESS_DEFS).map((def) => `
            <button class="btn btn-ghost" style="justify-content:space-between;" data-start-business="${def.id}">
              <span>${def.icon} ${def.name}</span>
              <span style="color:var(--warn)">${def.startCost === 0 ? 'Бесплатно' : formatMoney(def.startCost)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    mainEl().querySelectorAll('[data-start-business]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.startBusiness;
        const def = BUSINESS_DEFS[id];
        if (def.startCost > 0 && state.balance < def.startCost) {
          showNotification('warn', '⚠️', `Недостаточно денег. Начни с фриланса — он бесплатный!`);
          return;
        }
        state.onboarded = true;
        const result = openBusiness(id);
        if (result.ok) {
          showNotification('success', '🎉', `Ты открыл бизнес «${def.name}»!`);
        }
        setScreen('dashboard');
      });
    });
  }

  // ===================================================================
  // ЭКРАН БИЗНЕСОВ
  // ===================================================================
  function renderBusinesses() {
    mainEl().innerHTML = `
      <div class="screen-title">Бизнесы</div>
      <div class="screen-subtitle">Открывай новые направления и прокачивай их</div>
      <div class="card-grid">
        ${Object.values(BUSINESS_DEFS).map((def) => businessCard(def)).join('')}
      </div>
    `;
    wireBusinessButtons();
  }

  function businessCard(def) {
    const owned = isBusinessOwned(def.id);
    const bs = getBusinessState(def.id);
    const income = getBusinessIncome(def.id) * 24;
    const expense = getBusinessExpense(def.id) * 24;
    const next = owned ? getNextUpgrade(def.id) : null;
    const maxed = owned && !next;
    const progressPct = owned ? Math.round((bs.upgrades.length / def.upgrades.length) * 100) : 0;

    return `
      <div class="biz-card ${owned ? '' : 'is-locked'}">
        <div class="biz-card__top">
          <div class="biz-card__icon">${def.icon}</div>
          <div style="flex:1;">
            <div class="biz-card__title">${def.name}</div>
            <div class="biz-card__desc">${def.description}</div>
          </div>
          ${owned ? '<span class="badge owned">Открыт</span>' : ''}
        </div>

        ${owned ? `
          <div class="biz-card__stats">
            <div class="biz-card__stat income">Доход <b>+${formatMoneyShort(income)}/день</b></div>
            <div class="biz-card__stat expense">Расход <b>−${formatMoneyShort(expense)}/день</b></div>
          </div>
          <div class="progress"><div class="progress__bar" style="width:${progressPct}%"></div></div>
          <div style="font-size:11px; color:var(--text-faint); margin-bottom:10px;">Прокачано: ${bs.upgrades.length} / ${def.upgrades.length}</div>

          ${maxed ? `
            <div class="badge" style="display:inline-block;">Максимальный уровень 🎉</div>
          ` : `
            <div class="upgrade-row" style="border-top:none; padding-top:0;">
              <div class="upgrade-row__info">
                <div class="upgrade-row__name">${next.name}</div>
                <div class="upgrade-row__effect">+${formatMoneyShort(next.income * 24)}/день ${next.expense ? `· −${formatMoneyShort(next.expense * 24)}/день расходов` : ''}</div>
                <div class="upgrade-row__price">${formatMoney(next.cost)}</div>
              </div>
              <button class="btn btn-primary btn-sm" data-buy-upgrade="${def.id}:${next.id}" ${state.balance < next.cost ? 'disabled' : ''}>Купить</button>
            </div>
          `}
          <button class="btn btn-ghost btn-sm" style="width:100%; margin-top:10px;" data-view-tree="${def.id}">Всё дерево улучшений</button>
        ` : `
          <div class="biz-card__stats">
            <div class="biz-card__stat income">Старт. доход <b>+${formatMoneyShort(def.baseIncome * 24)}/день</b></div>
          </div>
          <button class="btn btn-money" data-open-business="${def.id}" ${state.balance < def.startCost ? 'disabled' : ''}>
            Открыть за ${def.startCost === 0 ? 'бесплатно' : formatMoney(def.startCost)}
          </button>
        `}
      </div>
    `;
  }

  function wireBusinessButtons() {
    mainEl().querySelectorAll('[data-open-business]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.openBusiness;
        const def = BUSINESS_DEFS[id];
        const result = openBusiness(id);
        if (result.ok) {
          showNotification('success', '🎉', `Открыт новый бизнес: ${def.name}!`);
          spawnFloat(btn, `+ ${def.name}`, false);
          renderBusinesses();
        } else if (result.reason === 'not_enough_money') {
          showNotification('warn', '⚠️', 'Недостаточно денег');
        }
      });
    });

    mainEl().querySelectorAll('[data-buy-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const parts = btn.dataset.buyUpgrade.split(':');
        const bizId = parts[0], upgradeId = parts[1];
        const def = BUSINESS_DEFS[bizId];
        const upgrade = def.upgrades.find((u) => u.id === upgradeId);
        const result = buyUpgrade(bizId, upgradeId);
        if (result.ok) {
          showNotification('success', '⬆️', `Улучшение куплено: ${upgrade.name}`);
          spawnFloat(btn, `+${formatMoneyShort(upgrade.income * 24)}/день`, false);
          renderBusinesses();
        } else if (result.reason === 'not_enough_money') {
          showNotification('warn', '⚠️', 'Недостаточно денег для улучшения');
        }
      });
    });

    mainEl().querySelectorAll('[data-view-tree]').forEach((btn) => {
      btn.addEventListener('click', () => openUpgradeTreeModal(btn.dataset.viewTree));
    });
  }

  function openUpgradeTreeModal(bizId) {
    const def = BUSINESS_DEFS[bizId];
    const bs = getBusinessState(bizId);
    openModal(`
      <div class="modal-title">${def.icon} Дерево улучшений — ${def.name}</div>
      <div class="modal-text">
        ${def.upgrades.map((u, i) => {
          const done = bs.upgrades.indexOf(u.id) !== -1;
          const locked = i > 0 && bs.upgrades.indexOf(def.upgrades[i - 1].id) === -1;
          return `
            <div class="upgrade-row">
              <div class="upgrade-row__info">
                <div class="upgrade-row__name">${u.name} ${done ? '<span class="badge owned">Куплено</span>' : locked ? '<span class="badge locked">Закрыто</span>' : ''}</div>
                <div class="upgrade-row__effect">${u.desc}</div>
                <div class="upgrade-row__effect">+${formatMoneyShort(u.income * 24)}/день дохода${u.expense ? `, −${formatMoneyShort(u.expense * 24)}/день расходов` : ''}</div>
              </div>
              <div class="upgrade-row__price">${formatMoney(u.cost)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `);
  }

  // ===================================================================
  // ЭКРАН СОТРУДНИКОВ
  // ===================================================================
  function renderEmployees() {
    const capacity = getEmployeeCapacity();
    const total = getTotalEmployeeCount();
    const noBusiness = getOwnedBusinessIds().length === 0;

    mainEl().innerHTML = `
      <div class="screen-title">Команда</div>
      <div class="screen-subtitle">Нанимай сотрудников, чтобы увеличить доход</div>

      <div class="panel">
        <div style="display:flex; justify-content:space-between; font-size:13px;">
          <span>Занято мест</span>
          <span><b>${total}</b> / ${capacity}</span>
        </div>
        <div class="progress"><div class="progress__bar" style="width:${Math.min(100, (total / capacity) * 100)}%"></div></div>
        <div style="font-size:11px; color:var(--text-faint); margin-top:6px;">Купи недвижимость во вкладке «Активы», чтобы увеличить лимит сотрудников.</div>
      </div>

      ${noBusiness ? `
        <div class="panel empty-state">
          <div class="empty-state__icon">👥</div>
          <div class="empty-state__text">Сначала открой хотя бы один бизнес,<br>чтобы иметь возможность нанимать людей.</div>
        </div>
      ` : `
        <div class="card-grid">
          ${Object.values(EMPLOYEE_DEFS).map((def) => `
            <div class="emp-card">
              <div class="emp-avatar">${def.icon}</div>
              <div class="emp-info">
                <div class="emp-name">${def.name} <span class="tag">×${getEmployeeCount(def.id)}</span></div>
                <div class="emp-meta">Зарплата <span class="minus">−${formatMoneyShort(def.salaryPerHour * 24)}/день</span> · Доход <span class="plus">+${formatMoneyShort(def.incomePerHour * 24)}/день</span></div>
              </div>
              <button class="btn btn-primary btn-sm" data-hire="${def.id}" ${(state.balance < def.hireCost || !canHireMore()) ? 'disabled' : ''}>
                ${formatMoney(def.hireCost)}
              </button>
            </div>
          `).join('')}
        </div>
      `}
    `;

    mainEl().querySelectorAll('[data-hire]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.hire;
        const def = EMPLOYEE_DEFS[id];
        const result = hireEmployee(id);
        if (result.ok) {
          showNotification('success', '🤝', `Нанят: ${def.name}`);
          renderEmployees();
        } else if (result.reason === 'not_enough_money') {
          showNotification('warn', '⚠️', 'Недостаточно денег');
        } else if (result.reason === 'capacity') {
          showNotification('warn', '⚠️', 'Нет свободных мест. Купи офис во вкладке «Активы».');
        }
      });
    });
  }

  // ===================================================================
  // ЭКРАН НЕДВИЖИМОСТИ (АКТИВЫ)
  // ===================================================================
  function renderProperty() {
    mainEl().innerHTML = `
      <div class="screen-title">Активы</div>
      <div class="screen-subtitle">Недвижимость увеличивает доход и вместимость команды</div>
      <div class="card-grid">
        ${Object.values(PROPERTY_DEFS).map((def) => `
          <div class="prop-card">
            <div class="prop-icon">${def.icon}</div>
            <div class="prop-body">
              <div class="prop-title">${def.name} ${isPropertyOwned(def.id) ? '<span class="badge owned">Куплено</span>' : ''}</div>
              <div class="prop-desc">${def.desc}</div>
              ${!isPropertyOwned(def.id) ? `<div class="prop-price">${formatMoney(def.cost)}</div>` : ''}
            </div>
            ${!isPropertyOwned(def.id) ? `
              <button class="btn btn-primary btn-sm" data-buy-property="${def.id}" ${state.balance < def.cost ? 'disabled' : ''}>Купить</button>
            ` : ''}
          </div>
        `).join('')}
      </div>
      <div class="panel">
        <div class="section-heading">Общий бонус к доходу</div>
        <div style="font-size:20px; font-weight:800; color:var(--income);">×${getPropertyIncomeMultiplier().toFixed(2)}</div>
      </div>
    `;

    mainEl().querySelectorAll('[data-buy-property]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.buyProperty;
        const def = PROPERTY_DEFS[id];
        const result = buyProperty(id);
        if (result.ok) {
          showNotification('success', '🏢', `Приобретено: ${def.name}`);
          renderProperty();
        } else if (result.reason === 'not_enough_money') {
          showNotification('warn', '⚠️', 'Недостаточно денег');
        }
      });
    });
  }

  // ===================================================================
  // ЭКРАН ИНВЕСТИЦИЙ
  // ===================================================================
  function renderInvest() {
    const active = getActiveInvestments();

    mainEl().innerHTML = `
      <div class="screen-title">Инвестиции</div>
      <div class="screen-subtitle">Вкладывай свободные деньги — параметры видны заранее</div>

      ${active.length ? `
        <div class="section-heading">Активные вложения</div>
        ${active.map((inv) => {
          const def = INVESTMENT_DEFS[inv.typeId];
          const pct = Math.round(getInvestmentProgress(inv) * 100);
          const daysLeft = getInvestmentDaysLeft(inv);
          return `
            <div class="invest-card">
              <div class="invest-head">
                <div class="invest-name">${def.icon} ${def.name}</div>
                <span class="risk-tag ${def.risk}">${riskLabel(def.risk)}</span>
              </div>
              <div style="font-size:12.5px; color:var(--text-dim);">Вложено: ${formatMoney(inv.amount)}</div>
              <div class="progress" style="margin-top:8px;"><div class="progress__bar" style="width:${pct}%"></div></div>
              <div class="invest-timer">${daysLeft > 0 ? `Созревает через: ${formatDays(daysLeft)}` : 'Готово к расчёту...'}</div>
            </div>
          `;
        }).join('')}
      ` : ''}

      <div class="section-heading">Доступные продукты</div>
      <div class="card-grid">
        ${Object.values(INVESTMENT_DEFS).map((def) => `
          <div class="invest-card">
            <div class="invest-head">
              <div class="invest-name">${def.icon} ${def.name}</div>
              <span class="risk-tag ${def.risk}">${riskLabel(def.risk)}</span>
            </div>
            <div style="font-size:12px; color:var(--text-dim); margin-bottom:8px;">${def.desc}</div>
            <div class="invest-stats">
              <div>Мин. сумма<b>${formatMoneyShort(def.minAmount)}</b></div>
              <div>Доходность<b style="color:var(--income)">+${Math.round(def.returnPct * 100)}%</b></div>
              <div>Срок<b>${formatDays(def.days)}</b></div>
              <div>Шанс успеха<b>${Math.round(def.successChance * 100)}%</b></div>
            </div>
            <button class="btn btn-primary btn-sm" data-invest="${def.id}" ${state.balance < def.minAmount ? 'disabled' : ''}>Инвестировать</button>
          </div>
        `).join('')}
      </div>
    `;

    mainEl().querySelectorAll('[data-invest]').forEach((btn) => {
      btn.addEventListener('click', () => openInvestModal(btn.dataset.invest));
    });
  }

  function riskLabel(risk) {
    return { low: 'Низкий риск', medium: 'Средний риск', high: 'Высокий риск' }[risk];
  }

  function openInvestModal(typeId) {
    const def = INVESTMENT_DEFS[typeId];
    openModal(`
      <div class="modal-title">${def.icon} ${def.name}</div>
      <div class="modal-text">
        ${def.desc}<br><br>
        Минимальная сумма: <b>${formatMoney(def.minAmount)}</b><br>
        Ожидаемая доходность: <b style="color:var(--income)">+${Math.round(def.returnPct * 100)}%</b><br>
        Срок: <b>${formatDays(def.days)}</b><br>
        Шанс успеха: <b>${Math.round(def.successChance * 100)}%</b><br>
        При неудаче потеря: <b style="color:var(--expense)">−${Math.round(def.failPct * 100)}%</b>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px; color:var(--text-dim);">Сумма вложения</label>
        <input type="number" id="invest-amount" value="${def.minAmount}" min="${def.minAmount}" step="1000"
          style="width:100%; margin-top:6px; padding:12px; border-radius:12px; border:1px solid var(--border); background:var(--panel); color:var(--text); font-size:15px;">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-cancel">Отмена</button>
        <button class="btn btn-primary" id="modal-confirm-invest">Инвестировать</button>
      </div>
    `);

    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm-invest').addEventListener('click', () => {
      const amount = Number(document.getElementById('invest-amount').value);
      const result = startInvestment(typeId, amount);
      if (result.ok) {
        showNotification('success', '📊', `Инвестиция открыта: ${def.name}`);
        closeModal();
        renderInvest();
      } else if (result.reason === 'below_min') {
        showNotification('warn', '⚠️', `Минимальная сумма: ${formatMoney(def.minAmount)}`);
      } else if (result.reason === 'not_enough_money') {
        showNotification('warn', '⚠️', 'Недостаточно денег');
      }
    });
  }

  // ===================================================================
  // ЭКРАН «ЕЩЁ»
  // ===================================================================
  function renderMore() {
    mainEl().innerHTML = `
      <div class="screen-title">Ещё</div>
      <div class="more-menu">
        <div class="more-item" id="menu-tutorial">
          <div class="more-item__icon">🎓</div><div class="more-item__label">Как играть</div><div class="more-item__chev">›</div>
        </div>
        <div class="more-item" data-goto="bank">
          <div class="more-item__icon">🏦</div><div class="more-item__label">Банк и кредит</div><div class="more-item__chev">›</div>
        </div>
        <div class="more-item" data-goto="jobs">
          <div class="more-item__icon">💼</div><div class="more-item__label">Подработка${state.selectedJob ? ` (${Player.JOB_DEFS[state.selectedJob].name})` : ''}</div><div class="more-item__chev">›</div>
        </div>
        <div class="more-item" data-goto="luxury">
          <div class="more-item__icon">🏝️</div><div class="more-item__label">Личное имущество${Lux.getOwnedLuxuryIds().length ? ` (${Lux.getOwnedLuxuryIds().length})` : ''}</div><div class="more-item__chev">›</div>
        </div>
        <div class="more-item" data-goto="achievements">
          <div class="more-item__icon">🏆</div><div class="more-item__label">Достижения (${getUnlockedCount()}/${ACHIEVEMENT_DEFS.length})</div><div class="more-item__chev">›</div>
        </div>
        <div class="more-item" data-goto="stats">
          <div class="more-item__icon">📊</div><div class="more-item__label">Статистика</div><div class="more-item__chev">›</div>
        </div>
        <div class="more-item" data-goto="devmap">
          <div class="more-item__icon">🗺️</div><div class="more-item__label">Карта развития</div><div class="more-item__chev">›</div>
        </div>
        <div class="more-item" id="menu-crystal-shop">
          <div class="more-item__icon">💎</div><div class="more-item__label">Магазин кристаллов</div><div class="more-item__chev">›</div>
        </div>
        <div class="more-item" id="menu-reset">
          <div class="more-item__icon">🗑️</div><div class="more-item__label" style="color:var(--danger)">Сбросить прогресс</div><div class="more-item__chev">›</div>
        </div>
      </div>
    `;

    mainEl().querySelectorAll('[data-goto]').forEach((el) => {
      el.addEventListener('click', () => setScreen(el.dataset.goto));
    });
    document.getElementById('menu-crystal-shop').addEventListener('click', openCrystalShop);
    document.getElementById('menu-reset').addEventListener('click', confirmReset);
    document.getElementById('menu-tutorial').addEventListener('click', () => openTutorial());
  }

  function confirmReset() {
    openModal(`
      <div class="modal-title">Сбросить прогресс?</div>
      <div class="modal-text">Это действие удалит весь текущий прогресс без возможности восстановления.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-cancel">Отмена</button>
        <button class="btn btn-danger" id="modal-confirm-reset">Сбросить</button>
      </div>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm-reset').addEventListener('click', () => {
      window.G.save.clearSave();
      S.resetState();
      closeModal();
      setScreen('dashboard');
      renderStatStrip();
      if (!state.tutorialSeen) {
        openTutorial();
      }
    });
  }

  // ===================================================================
  // БАНК / КРЕДИТ (не больше одного одновременно)
  // ===================================================================
  function creditUnavailableReasonText(check) {
    if (check.reason === 'too_early') return `Кредиты доступны начиная с ${check.availableDay}-го дня`;
    if (check.reason === 'already_has_credit') return 'У тебя уже есть активный кредит';
    if (check.reason === 'cooldown') return `Кредит будет снова доступен на ${check.availableDay}-й день`;
    if (check.reason === 'income_too_low') return `Нужна чистая прибыль от ${formatMoney(Math.ceil(check.required))}/день (сейчас ${formatMoney(check.net)})`;
    return 'Кредит недоступен';
  }

  function renderBank() {
    const net = getNetDailyIncome();

    mainEl().innerHTML = `
      <div class="screen-title">🏦 Банк</div>
      <div class="screen-subtitle">Не больше одного кредита одновременно, с запасом по доходу x${CONFIG.CREDIT_INCOME_MARGIN}</div>

      <div class="credit-warn">
        ⚠️ Кредит выдаётся только если чистая дневная прибыль (сейчас ${formatMoney(net)}) минимум в ${CONFIG.CREDIT_INCOME_MARGIN}
        раза выше дневного платежа. При оформлении удерживается комиссия ${Math.round(CONFIG.CREDIT_ORIGINATION_FEE_PCT * 100)}%.
        Пропуски платежей увеличивают долг, а ${CONFIG.CREDIT_DEFAULT_MISSED_LIMIT} пропусков подряд — дефолт: долг спишется,
        но репутация сильно упадёт и кредиты будут недоступны ${CONFIG.CREDIT_DEFAULT_COOLDOWN_DAYS} дней.
      </div>

      ${state.credit ? `
        <div class="section-heading">Твой кредит</div>
        <div class="credit-active">
          <div style="display:flex; justify-content:space-between;">
            <b>${formatMoney(state.credit.amount)}</b>
            <span style="font-size:12px; color:var(--text-dim);">${Math.round(state.credit.rate * 100)}% · ${formatDays(state.credit.days)}</span>
          </div>
          <div style="font-size:12px; color:var(--expense); margin-top:4px;">Осталось выплатить: ${formatMoney(state.credit.remainingAmount)}</div>
          <div style="font-size:11.5px; color:var(--text-dim);">Ежедневный платёж: ${formatMoney(state.credit.dailyPayment)}${state.credit.missedPayments ? ` · Пропущено: ${state.credit.missedPayments}` : ''}</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="btn-repay-early" style="width:100%; margin-top:10px;">Погасить досрочно (комиссия ${Math.round(CONFIG.CREDIT_EARLY_REPAY_FEE_PCT * 100)}%, короче кулдаун)</button>
      ` : state.creditCooldownUntilDay > state.day ? `
        <div class="empty-state" style="margin-top:8px;">
          <div class="empty-state__icon">⏳</div>
          <div class="empty-state__text">Кредит будет снова доступен на ${state.creditCooldownUntilDay}-й день (сейчас день ${state.day})</div>
        </div>
      ` : `
        <div class="section-heading">Доступные предложения</div>
        ${CREDIT_OFFERS.map((o) => {
          const dailyPayment = getOfferDailyPayment(o);
          const check = canTakeCredit(o);
          const fee = Math.round(o.amount * CONFIG.CREDIT_ORIGINATION_FEE_PCT);
          return `
            <div class="credit-offer">
              <div>
                <div style="font-weight:700; font-size:14px;">${formatMoney(o.amount)} <span style="font-weight:400; font-size:11px; color:var(--text-faint);">(на руки ${formatMoney(o.amount - fee)})</span></div>
                <div style="font-size:11.5px; color:var(--text-dim);">Ставка ${Math.round(o.rate * 100)}% · Срок ${formatDays(o.days)} · Платёж ${formatMoney(dailyPayment)}/день</div>
                ${!check.ok ? `<div style="font-size:11px; color:var(--danger); margin-top:3px;">${creditUnavailableReasonText(check)}</div>` : ''}
              </div>
              <button class="btn btn-primary btn-sm" data-take-credit="${o.amount}" ${!check.ok ? 'disabled' : ''}>Взять</button>
            </div>
          `;
        }).join('')}
      `}
    `;

    mainEl().querySelectorAll('[data-take-credit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const amount = Number(btn.dataset.takeCredit);
        const offer = CREDIT_OFFERS.find((o) => o.amount === amount);
        const dailyPayment = getOfferDailyPayment(offer);
        const fee = Math.round(offer.amount * CONFIG.CREDIT_ORIGINATION_FEE_PCT);
        openModal(`
          <div class="modal-title">Оформить кредит?</div>
          <div class="modal-text">
            Сумма: <b>${formatMoney(offer.amount)}</b><br>
            Комиссия за оформление: <b>${formatMoney(fee)}</b> (на руки ${formatMoney(offer.amount - fee)})<br>
            Ставка: <b>${Math.round(offer.rate * 100)}%</b><br>
            Срок: <b>${formatDays(offer.days)}</b><br>
            Ежедневный платёж: <b>${formatMoney(dailyPayment)}</b><br><br>
            ⚠️ Пропуск платежа увеличит долг и снизит репутацию. ${CONFIG.CREDIT_DEFAULT_MISSED_LIMIT} пропусков подряд — дефолт.
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-confirm-credit">Оформить</button>
          </div>
        `);
        document.getElementById('modal-cancel').addEventListener('click', closeModal);
        document.getElementById('modal-confirm-credit').addEventListener('click', () => {
          const result = takeCredit(amount);
          if (result.ok) {
            showNotification('success', '🏦', `Кредит на ${formatMoney(amount)} получен (на руки ${formatMoney(result.disbursed)})`);
            closeModal();
            renderBank();
            renderStatStrip();
          } else {
            showNotification('warn', '⚠️', creditUnavailableReasonText(result));
            closeModal();
          }
        });
      });
    });

    const repayBtn = document.getElementById('btn-repay-early');
    if (repayBtn) {
      repayBtn.addEventListener('click', () => {
        const credit = state.credit;
        const fee = Math.round(credit.remainingAmount * CONFIG.CREDIT_EARLY_REPAY_FEE_PCT);
        const totalCost = credit.remainingAmount + fee;
        openModal(`
          <div class="modal-title">Погасить кредит досрочно?</div>
          <div class="modal-text">
            Остаток долга: <b>${formatMoney(credit.remainingAmount)}</b><br>
            Комиссия за досрочное погашение: <b>${formatMoney(fee)}</b><br>
            Итого спишется: <b>${formatMoney(totalCost)}</b><br><br>
            После погашения новый кредит будет доступен уже через ${CONFIG.CREDIT_EARLY_REPAY_COOLDOWN_DAYS} дней.
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-confirm-repay">Погасить</button>
          </div>
        `);
        document.getElementById('modal-cancel').addEventListener('click', closeModal);
        document.getElementById('modal-confirm-repay').addEventListener('click', () => {
          const result = Econ.repayCreditEarly();
          closeModal();
          if (result.ok) {
            showNotification('success', '🏦', `Кредит погашен досрочно (−${formatMoney(result.totalCost)})`);
            renderBank();
            renderStatStrip();
          } else {
            showNotification('warn', '⚠️', 'Недостаточно денег для досрочного погашения');
          }
        });
      });
    }
  }

  // ===================================================================
  // ПОДРАБОТКА — гарантированный доход на один день, без бизнеса
  // ===================================================================
  function renderJobs() {
    const selected = state.selectedJob;
    mainEl().innerHTML = `
      <div class="screen-title">💼 Подработка</div>
      <div class="screen-subtitle">Выбери работу на сегодня — доход придёт при нажатии «Следующий день», но отнимет силы</div>

      ${state.burnoutDays > 0 ? `
        <div class="credit-warn">⚠️ Во время выгорания подработка недоступна — сначала восстанови здоровье.</div>
      ` : ''}

      ${selected ? `
        <div class="credit-active" style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <b>${Player.JOB_DEFS[selected].icon} ${Player.JOB_DEFS[selected].name}</b>
            <span style="color:var(--income); font-size:13px;">+${formatMoney(Player.JOB_DEFS[selected].pay)}</span>
          </div>
          <div style="font-size:11.5px; color:var(--text-dim); margin-top:4px;">Выбрано на сегодня — сработает при переходе на следующий день</div>
          <button class="btn btn-ghost btn-sm" id="btn-cancel-job" style="width:100%; margin-top:8px;">Отменить выбор</button>
        </div>
      ` : ''}

      <div class="card-grid">
        ${Object.values(Player.JOB_DEFS).map((def) => {
          const check = Player.canWorkJob(def.id);
          const costParts = [];
          if (def.cost.nutrition) costParts.push(`🍔 −${def.cost.nutrition}`);
          if (def.cost.mood) costParts.push(`🙂 −${def.cost.mood}`);
          if (def.cost.health) costParts.push(`❤️ −${def.cost.health}`);
          return `
            <div class="biz-card">
              <div class="biz-card__top">
                <div class="biz-card__icon">${def.icon}</div>
                <div>
                  <div class="biz-card__title">${def.name}</div>
                  <div class="biz-card__desc">${def.desc}</div>
                </div>
              </div>
              <div class="biz-card__stats">
                <div class="biz-card__stat income">Оплата <b>+${formatMoney(def.pay)}</b></div>
                <div class="biz-card__stat expense">Цена <b>${costParts.join(' ')}</b></div>
              </div>
              ${!check.ok && check.reason === 'low_reputation' ? `<div style="font-size:11px; color:var(--danger); margin-top:4px;">Нужна репутация от ${check.need}</div>` : ''}
              <button class="btn ${selected === def.id ? 'btn-primary' : 'btn-ghost'} btn-sm" style="width:100%; margin-top:8px;" data-select-job="${def.id}" ${!check.ok ? 'disabled' : ''}>${selected === def.id ? 'Выбрано' : 'Выбрать на сегодня'}</button>
            </div>
          `;
        }).join('')}
      </div>
    `;

    mainEl().querySelectorAll('[data-select-job]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = Player.selectJob(btn.dataset.selectJob);
        if (result.ok) {
          showNotification('success', '💼', `Работа «${Player.JOB_DEFS[btn.dataset.selectJob].name}» выбрана на сегодня`);
          renderJobs();
        } else {
          showNotification('warn', '⚠️', 'Эта подработка сейчас недоступна');
        }
      });
    });
    const cancelBtn = document.getElementById('btn-cancel-job');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { Player.selectJob(null); renderJobs(); });
  }

  // ===================================================================
  // ЛИЧНОЕ ИМУЩЕСТВО — машины, дома, яхты, острова. Не приносит дохода,
  // только статус (репутация) + ежедневное содержание. Покупать не
  // подумав — прямой путь уйти в минус: содержание суммируется с
  // остальными расходами каждый день.
  // ===================================================================
  function luxuryUnavailableReasonText(check) {
    if (check.reason === 'already_owned') return 'Уже куплено';
    if (check.reason === 'low_reputation') return `Нужна репутация от ${check.need}`;
    if (check.reason === 'not_enough_money') return 'Недостаточно денег';
    return 'Недоступно';
  }

  function renderLuxury() {
    const upkeep = Lux.getLuxuryUpkeepTotal();
    mainEl().innerHTML = `
      <div class="screen-title">🏝️ Личное имущество</div>
      <div class="screen-subtitle">Статус и репутация — но не доход. Каждая вещь требует содержания каждый день</div>

      ${upkeep > 0 ? `
        <div class="credit-warn">
          💸 Текущее содержание имущества: <b>${formatMoney(upkeep)}/день</b> — списывается автоматически вместе с остальными расходами.
          Если расходы превысят доход, баланс уйдёт в минус.
        </div>
      ` : `
        <div class="credit-warn">
          ⚠️ У дорогих вещей высокое ежедневное содержание. Покупай, только если доход стабильно его покрывает —
          иначе легко уйти в минус.
        </div>
      `}

      ${Object.entries(Lux.LUXURY_DEFS).map(([catId, cat]) => `
        <div class="section-heading">${cat.label}</div>
        <div class="card-grid">
          ${cat.items.map((item) => {
            const owned = Lux.isLuxuryOwned(item.id);
            const check = Lux.canBuyLuxury(item.id);
            return `
              <div class="biz-card">
                <div class="biz-card__top">
                  <div class="biz-card__icon">${item.icon}</div>
                  <div>
                    <div class="biz-card__title">${item.name}</div>
                    <div class="biz-card__desc">${item.desc}</div>
                  </div>
                </div>
                <div class="biz-card__stats">
                  <div class="biz-card__stat expense">Стоимость <b>${formatMoney(item.cost)}</b></div>
                  <div class="biz-card__stat expense">Содержание <b>${formatMoney(item.upkeep)}/день</b></div>
                </div>
                ${item.reputation ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">+${item.reputation} репутации</div>` : ''}
                ${!owned && !check.ok ? `<div style="font-size:11px; color:var(--danger); margin-top:3px;">${luxuryUnavailableReasonText(check)}</div>` : ''}
                <button class="btn ${owned ? 'btn-ghost' : 'btn-primary'} btn-sm" style="width:100%; margin-top:8px;" data-buy-luxury="${item.id}" ${owned || !check.ok ? 'disabled' : ''}>${owned ? 'Куплено' : 'Купить'}</button>
              </div>
            `;
          }).join('')}
        </div>
      `).join('')}
    `;

    mainEl().querySelectorAll('[data-buy-luxury]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.buyLuxury;
        const item = Lux.findItem(id);
        openModal(`
          <div class="modal-title">${item.icon} Купить «${item.name}»?</div>
          <div class="modal-text">
            Стоимость: <b>${formatMoney(item.cost)}</b><br>
            Содержание: <b>${formatMoney(item.upkeep)}/день</b> (будет списываться каждый день)<br>
            ${item.reputation ? `Репутация: <b>+${item.reputation}</b><br>` : ''}
            <br>⚠️ Это не приносит дохода — только статус. Убедись, что твой доход покрывает новые расходы.
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-confirm-luxury">Купить</button>
          </div>
        `);
        document.getElementById('modal-cancel').addEventListener('click', closeModal);
        document.getElementById('modal-confirm-luxury').addEventListener('click', () => {
          const result = Lux.buyLuxury(id);
          closeModal();
          if (result.ok) {
            showNotification('success', item.icon, `Куплено: ${item.name}`);
            renderLuxury();
            renderStatStrip();
          } else {
            showNotification('warn', '⚠️', luxuryUnavailableReasonText(result));
          }
        });
      });
    });
  }

  // ===================================================================
  // ДОСТИЖЕНИЯ
  // ===================================================================
  function renderAchievements() {
    mainEl().innerHTML = `
      <div class="screen-title">Достижения</div>
      <div class="screen-subtitle">${getUnlockedCount()} из ${ACHIEVEMENT_DEFS.length} получено</div>
      <div class="ach-grid">
        ${ACHIEVEMENT_DEFS.map((a) => `
          <div class="ach-card ${state.achievements[a.id] ? 'unlocked' : ''}">
            <div class="ach-icon">${a.icon}</div>
            <div class="ach-title">${a.name}</div>
            <div class="ach-desc">${a.desc}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ===================================================================
  // СТАТИСТИКА
  // ===================================================================
  function renderStats() {
    const net = getNetDailyIncome();
    mainEl().innerHTML = `
      <div class="screen-title">Статистика</div>
      <div class="stats-list">
        <div class="stats-item"><div class="stats-item__label">Игровой день</div><div class="stats-item__value">${state.day}</div></div>
        <div class="stats-item"><div class="stats-item__label">Общий заработок</div><div class="stats-item__value" style="color:var(--income)">${formatMoneyShort(state.totalEarned)}</div></div>
        <div class="stats-item"><div class="stats-item__label">Общие расходы</div><div class="stats-item__value" style="color:var(--expense)">${formatMoneyShort(state.totalExpenses)}</div></div>
        <div class="stats-item"><div class="stats-item__label">Налогов уплачено</div><div class="stats-item__value">${formatMoneyShort(state.totalTaxPaid)}</div></div>
        <div class="stats-item"><div class="stats-item__label">Чистая прибыль/день</div><div class="stats-item__value">${formatMoneyShort(net)}</div></div>
        <div class="stats-item"><div class="stats-item__label">Макс. баланс</div><div class="stats-item__value">${formatMoneyShort(state.maxBalance)}</div></div>
        <div class="stats-item"><div class="stats-item__label">Бизнесов</div><div class="stats-item__value">${getOwnedBusinessIds().length}</div></div>
        <div class="stats-item"><div class="stats-item__label">Сотрудников</div><div class="stats-item__value">${getTotalEmployeeCount()}</div></div>
        <div class="stats-item"><div class="stats-item__label">Стоимость активов</div><div class="stats-item__value">${formatMoneyShort(getTotalAssetsValue())}</div></div>
        <div class="stats-item"><div class="stats-item__label">Активные инвестиции</div><div class="stats-item__value">${getActiveInvestments().length}</div></div>
        <div class="stats-item"><div class="stats-item__label">Долг по кредиту</div><div class="stats-item__value">${formatMoneyShort(getActiveCreditTotal())}</div></div>
        <div class="stats-item"><div class="stats-item__label">Случаев выгорания</div><div class="stats-item__value">${state.stats.burnoutEvents}</div></div>
      </div>

      <div class="panel chart-wrap">
        <div class="section-heading">График баланса по дням</div>
        ${renderBalanceChart()}
      </div>
    `;
  }

  function renderBalanceChart() {
    const points = state.balanceHistory;
    if (points.length < 2) {
      return `<div class="empty-state" style="padding:20px;"><div class="empty-state__text">Пока недостаточно данных для графика — сделай ещё пару шагов вперёд</div></div>`;
    }
    const w = 300, h = 120, pad = 8;
    const values = points.map((p) => p.v);
    const min = Math.min.apply(null, values.concat([0]));
    const max = Math.max.apply(null, values.concat([1]));
    const range = max - min || 1;

    const coords = points.map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      const y = h - pad - ((p.v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const areaPath = `M${coords[0]} L${coords.join(' L')} L${w - pad},${h - pad} L${pad},${h - pad} Z`;
    const linePath = `M${coords.join(' L')}`;

    return `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="140" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#38e296" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#38e296" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#chartFill)"/>
        <path d="${linePath}" fill="none" stroke="#38e296" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    `;
  }

  // ===================================================================
  // КАРТА РАЗВИТИЯ
  // ===================================================================
  function renderDevMap() {
    const owned = getOwnedBusinessIds();
    const nodes = [
      { label: 'Старт', done: true },
      { label: 'Первый заработок', done: state.totalEarned >= 1000 },
      { label: 'Первый бизнес', done: owned.length >= 1 },
      { label: 'Первый сотрудник', done: getTotalEmployeeCount() >= 1 },
      { label: 'Первый офис', done: Object.keys(state.properties).length >= 1 },
      { label: 'Несколько бизнесов', done: owned.length >= 2 },
      { label: 'Первый налог уплачен', done: state.stats.taxCyclesPaid >= 1 },
      { label: 'Компания', done: state.reputation >= 50 },
      { label: 'Холдинг', done: state.reputation >= 100 },
      { label: 'Корпорация', done: state.reputation >= 200 },
    ];

    mainEl().innerHTML = `
      <div class="screen-title">Карта развития</div>
      <div class="devmap">
        ${nodes.map((n, i) => `
          <div class="devmap-node ${n.done ? 'done' : ''}">
            <div class="devmap-dot"></div>
            <div class="devmap-label">${n.label}</div>
            ${n.done ? '<span class="badge owned">✓</span>' : ''}
          </div>
          ${i < nodes.length - 1 ? `<div class="devmap-line ${n.done ? 'done' : ''}"></div>` : ''}
        `).join('')}
      </div>
    `;
  }

  // ===================================================================
  // МОДАЛКА ВОССТАНОВЛЕНИЯ (здоровье/питание/настроение)
  // ===================================================================
  function openRestoreModal() {
    const R = Player.RESTORE_ACTIONS;
    openModal(`
      <div class="modal-title">❤️ Забота о себе</div>
      <div class="modal-text">Здоровье: <b>${Math.round(state.health)}</b> · Питание: <b>${Math.round(state.nutrition)}</b> · Настроение: <b>${Math.round(state.mood)}</b></div>
      ${Object.values(R).map((def) => `
        <div class="restore-row">
          <div class="restore-icon">${def.icon}</div>
          <div style="flex:1;">
            <div class="restore-name">${def.name}</div>
            <div class="restore-desc">${def.desc}</div>
          </div>
          <button class="btn btn-primary btn-sm" data-restore="${def.id}" ${state.balance < def.cost ? 'disabled' : ''}>${formatMoney(def.cost)}</button>
        </div>
      `).join('')}
      <div class="restore-row">
        <div class="restore-icon">✨</div>
        <div style="flex:1;">
          <div class="restore-name">Полное восстановление</div>
          <div class="restore-desc">Здоровье, питание и настроение — сразу на 100</div>
        </div>
        <button class="btn btn-crystal btn-sm" id="btn-crystal-restore" ${state.crystals < CONFIG.CRYSTAL_FULL_RESTORE_COST ? 'disabled' : ''}>${CONFIG.CRYSTAL_FULL_RESTORE_COST} 💎</button>
      </div>
    `);

    mainEl();
    document.getElementById('modal-root').querySelectorAll('[data-restore]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.restore;
        const def = R[id];
        const result = Player.buyRestoreAction(id);
        if (result.ok) {
          showNotification('success', def.icon, `${def.name} восстановил показатели`);
          closeModal();
          render();
        } else {
          showNotification('warn', '⚠️', 'Недостаточно денег');
        }
      });
    });
    const crystalBtn = document.getElementById('btn-crystal-restore');
    if (crystalBtn) {
      crystalBtn.addEventListener('click', () => {
        const result = Player.fullRestoreWithCrystals();
        if (result.ok) {
          showNotification('success', '✨', 'Полное восстановление!');
          closeModal();
          render();
        } else {
          showNotification('warn', '⚠️', 'Недостаточно кристаллов');
        }
      });
    }
  }

  // ===================================================================
  // МОДАЛКА ИТОГОВ ДНЯ
  // ===================================================================
  function openDaySummaryModal(report) {
    const notes = [];

    if (report.burnout) {
      notes.push({ type: 'danger', text: '🔥 Ты был в выгорании — доход за этот день не начислялся.' });
    }
    if (!report.burnout && report.net < 0) {
      notes.push({ type: 'danger', text: `📉 Расходы (зарплаты, кредит, содержание имущества) превысили доход — баланс за день ушёл в минус на ${formatMoney(Math.abs(report.net))}. Проверь расходы во вкладках.` });
    }
    if (report.credit.hasCredit) {
      if (report.credit.defaulted) {
        notes.push({ type: 'danger', text: '💥 Дефолт по кредиту: слишком много пропущенных платежей подряд. Долг списан, но репутация сильно упала, а новые кредиты будут недоступны надолго.' });
      } else if (report.credit.missed) {
        notes.push({ type: 'danger', text: '⚠️ Не хватило денег на платёж по кредиту — долг вырос, репутация снизилась.' });
      } else if (report.credit.paidOff) {
        notes.push({ type: 'success', text: '✅ Кредит полностью погашен!' });
      }
    }
    if (report.job) {
      notes.push({ type: 'success', text: `${report.job.icon} Подработка «${report.job.name}»: +${formatMoney(report.job.pay)}` });
    }
    if (report.event) {
      notes.push({ type: 'info', text: `${report.event.icon} ${report.event.text}` });
    }
    if (report.investmentsResolved && report.investmentsResolved.length) {
      report.investmentsResolved.forEach((inv) => {
        const def = INVESTMENT_DEFS[inv.typeId];
        notes.push({
          type: inv.success ? 'success' : 'warn',
          text: `${def.icon} ${def.name}: ${inv.success ? 'инвестиция окупилась' : 'не сработала'}, получено ${formatMoney(inv.payout)}`,
        });
      });
    }

    let taxHtml = '';
    if (report.tax) {
      const crystalCost = getTaxCrystalCost(report.tax.amount);
      taxHtml = `
        <div class="summary-note warn">
          🧾 Начислен налог за отчётный период (ставка ${Math.round(report.tax.rate * 100)}%): <b>${formatMoney(report.tax.amount)}</b> уже списаны с баланса.
          ${state.crystals >= crystalCost ? `
            <div style="margin-top:8px;">
              <button class="btn btn-crystal btn-sm" id="btn-pay-tax-crystals" style="width:100%;">Оплатить кристаллами вместо денег (${crystalCost} 💎)</button>
            </div>
          ` : ''}
        </div>
      `;
    }

    openModal(`
      <div class="modal-title">📅 День ${report.day} завершён</div>
      <div class="summary-row"><span class="label">Доход</span><span style="color:var(--income); font-weight:700;">${formatSigned(report.income)}</span></div>
      <div class="summary-row"><span class="label">Расходы</span><span style="color:var(--expense); font-weight:700;">−${formatMoney(report.expense)}</span></div>
      <div class="summary-row"><span class="label">Итог за день</span><span style="font-weight:800;">${formatSigned(report.net)}</span></div>
      <div class="summary-row"><span class="label">Баланс</span><span style="font-weight:800;">${formatMoney(state.balance)}</span></div>

      <div class="section-heading" style="margin-top:14px;">Состояние</div>
      <div class="summary-row"><span class="label">❤️ Здоровье</span><span>${Math.round(report.health.health)} → ${Math.round(report.healthAfter.health)}</span></div>
      <div class="summary-row"><span class="label">🍎 Питание</span><span>${Math.round(report.health.nutrition)} → ${Math.round(report.healthAfter.nutrition)}</span></div>
      <div class="summary-row"><span class="label">🙂 Настроение</span><span>${Math.round(report.health.mood)} → ${Math.round(report.healthAfter.mood)}</span></div>

      ${taxHtml}
      ${notes.map((n) => `<div class="summary-note ${n.type}">${n.text}</div>`).join('')}

      <button class="btn btn-primary" style="width:100%; margin-top:16px;" id="btn-close-summary">Понятно</button>
    `);

    const closeBtn = document.getElementById('btn-close-summary');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        closeModal();
        // интерстишл показывается на естественном переходе (после того,
        // как игрок закрыл итоги дня), не чаще, чем раз в N дней,
        // и не раньше INTERSTITIAL_MIN_DAY — см. app.js
        window.G.app.maybeShowInterstitial();
      });
    }

    const payTaxBtn = document.getElementById('btn-pay-tax-crystals');
    if (payTaxBtn) {
      payTaxBtn.addEventListener('click', () => {
        const result = refundTaxAndPayWithCrystals(report.tax.amount);
        if (result.ok) {
          showNotification('success', '💎', 'Налог оплачен кристаллами, деньги возвращены');
          renderStatStrip();
          payTaxBtn.remove();
        } else {
          showNotification('warn', '⚠️', 'Недостаточно кристаллов');
        }
      });
    }
  }

  // ===================================================================
  // ОБУЧЕНИЕ (тур по механикам при старте)
  // ===================================================================
  const TUTORIAL_STEPS = [
    {
      icon: '🏢',
      title: 'Бизнесы приносят доход в день',
      text: 'Открывай бизнесы и покупай улучшения — каждый даёт доход и расход в день (не в реальном времени).',
    },
    {
      icon: '📅',
      title: 'Кнопка «Следующий день»',
      text: 'Баланс меняется только тогда, когда ты нажимаешь «Следующий день». В этот момент считаются доходы, расходы, кредит и налог.',
    },
    {
      icon: '❤️',
      title: 'Здоровье, питание, настроение',
      text: 'Питание падает каждый день — нужно есть. Если здоровье упадёт до нуля — наступит выгорание, и бизнес перестанет приносить доход, пока ты не восстановишься.',
    },
    {
      icon: '🏦',
      title: 'Кредит — только один и по средствам',
      text: 'Банк выдаст кредит, только если твоя чистая дневная прибыль выше ежедневного платежа. Одновременно можно иметь не больше одного кредита.',
    },
    {
      icon: '🧾',
      title: 'Налог каждые 60 дней',
      text: 'Раз в 60 дней государство берёт процент от твоего текущего дневного дохода — чем больше зарабатываешь, тем выше ставка.',
    },
    {
      icon: '💎',
      title: 'Кристаллы — только за рекламу',
      text: 'Кристаллы можно получить только просмотром рекламы. Ими можно ускорить доход, погасить налог или полностью восстановить силы.',
    },
  ];

  function openTutorial(step) {
    const i = step || 0;
    const s = TUTORIAL_STEPS[i];
    const isLast = i === TUTORIAL_STEPS.length - 1;

    openModal(`
      <div class="tut-icon">${s.icon}</div>
      <div class="modal-title" style="text-align:center;">${s.title}</div>
      <div class="modal-text" style="text-align:center;">${s.text}</div>
      <div class="tut-dots">
        ${TUTORIAL_STEPS.map((_, idx) => `<div class="tut-dot ${idx === i ? 'active' : ''}"></div>`).join('')}
      </div>
      <div class="modal-actions">
        ${!isLast ? `<button class="btn btn-ghost" id="tut-skip">Пропустить</button>` : ''}
        <button class="btn btn-primary" id="tut-next">${isLast ? 'Начать игру' : 'Далее'}</button>
      </div>
    `);

    const finish = () => {
      state.tutorialSeen = true;
      closeModal();
      window.G.save.saveGame();
    };

    const skipBtn = document.getElementById('tut-skip');
    if (skipBtn) skipBtn.addEventListener('click', finish);
    document.getElementById('tut-next').addEventListener('click', () => {
      if (isLast) finish();
      else openTutorial(i + 1);
    });
  }

  // ===================================================================
  // КРИСТАЛЬНЫЙ МАГАЗИН
  // ===================================================================
  function openCrystalShop() {
    openModal(`
      <div class="modal-title">💎 Магазин кристаллов</div>
      <div class="modal-text">У тебя: <b>${state.crystals}</b> кристаллов. Получить их можно только за просмотр рекламы.</div>
      <div class="upgrade-row">
        <div class="upgrade-row__info">
          <div class="upgrade-row__name">⚡ Ускорение дохода</div>
          <div class="upgrade-row__effect">+50% к доходу на ${formatDays(CONFIG.BOOST_DEFAULT_DAYS)}</div>
        </div>
        <button class="btn btn-crystal btn-sm" id="shop-boost" ${state.crystals < 5 ? 'disabled' : ''}>5 💎</button>
      </div>
      <div class="upgrade-row">
        <div class="upgrade-row__info">
          <div class="upgrade-row__name">💰 Мгновенная прибыль</div>
          <div class="upgrade-row__effect">Получить доход за 1 день сразу</div>
        </div>
        <button class="btn btn-crystal btn-sm" id="shop-instant" ${state.crystals < 10 ? 'disabled' : ''}>10 💎</button>
      </div>
      <div class="upgrade-row">
        <div class="upgrade-row__info">
          <div class="upgrade-row__name">🏷️ Скидка на улучшение</div>
          <div class="upgrade-row__effect">−20% на следующую покупку улучшения</div>
        </div>
        <button class="btn btn-crystal btn-sm" id="shop-discount" ${state.crystals < 8 ? 'disabled' : ''}>8 💎</button>
      </div>
      <div class="upgrade-row">
        <div class="upgrade-row__info">
          <div class="upgrade-row__name">✨ Полное восстановление сил</div>
          <div class="upgrade-row__effect">Здоровье, питание, настроение — на 100</div>
        </div>
        <button class="btn btn-crystal btn-sm" id="shop-restore" ${state.crystals < CONFIG.CRYSTAL_FULL_RESTORE_COST ? 'disabled' : ''}>${CONFIG.CRYSTAL_FULL_RESTORE_COST} 💎</button>
      </div>
      <div style="height:6px;"></div>
      <button class="btn btn-ghost" id="btn-watch-ad-modal">🎁 Смотреть рекламу за +5 💎</button>

      <div class="section-heading" style="margin-top:14px;">Или выполни задание</div>
      <adsgram-task
        data-block-id="${window.G.app.TASK_BLOCK_ID}"
        data-debug-console="false"
        id="adsgram-task-widget"
        style="display:block; width:100%;"
      ></adsgram-task>
    `);

    document.getElementById('btn-watch-ad-modal').addEventListener('click', () => requestRewardedAd());

    const taskWidget = document.getElementById('adsgram-task-widget');
    if (taskWidget) {
      taskWidget.addEventListener('reward', () => {
        window.G.app.onTaskRewarded();
      });
      taskWidget.addEventListener('onBannerNotFound', () => {
        // заданий сейчас нет — просто ничего не показываем поверх, виджет сам скрывается
      });
    }

    document.getElementById('shop-boost').addEventListener('click', () => {
      if (state.crystals < 5) return;
      addCrystals(-5);
      Econ.addBoost('income_mult', 1.5, CONFIG.BOOST_DEFAULT_DAYS);
      showNotification('success', '⚡', `Ускорение дохода активировано на ${formatDays(CONFIG.BOOST_DEFAULT_DAYS)}!`);
      closeModal();
      render();
    });

    document.getElementById('shop-instant').addEventListener('click', () => {
      if (state.crystals < 10) return;
      addCrystals(-10);
      state.balance += getFinalDailyIncome();
      showNotification('success', '💰', 'Мгновенная прибыль зачислена!');
      closeModal();
      render();
    });

    document.getElementById('shop-discount').addEventListener('click', () => {
      if (state.crystals < 8) return;
      addCrystals(-8);
      state.nextUpgradeDiscount = 0.2;
      showNotification('success', '🏷️', 'Скидка 20% активна на следующую покупку!');
      closeModal();
    });

    const restoreBtn = document.getElementById('shop-restore');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => {
        const result = Player.fullRestoreWithCrystals();
        if (result.ok) {
          showNotification('success', '✨', 'Полное восстановление!');
          closeModal();
          render();
        }
      });
    }
  }

  // ===================================================================
  // МОДАЛЬНЫЕ ОКНА
  // ===================================================================
  function openModal(innerHtml) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal-sheet">
          <button class="modal-close" id="modal-close-btn">✕</button>
          ${innerHtml}
        </div>
      </div>
    `;
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') closeModal();
    });
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  }

  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  // ===================================================================
  // УВЕДОМЛЕНИЯ
  // ===================================================================
  function showNotification(type, icon, text) {
    const container = document.getElementById('notif-container');
    const el = document.createElement('div');
    el.className = `notif ${type}`;
    el.innerHTML = `<span class="notif__icon">${icon}</span><span>${text}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 260);
    }, 3400);
  }

  // ===================================================================
  // ПЛАВАЮЩИЕ ЧИСЛА
  // ===================================================================
  function spawnFloat(anchorEl, text, negative) {
    const layer = document.getElementById('float-layer');
    const rect = anchorEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'float-num' + (negative ? ' neg' : '');
    el.textContent = text;
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${rect.top}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  function levelUpFlash() {
    const el = document.createElement('div');
    el.className = 'level-flash';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  // ===================================================================
  // ПОДПИСКИ НА СОБЫТИЯ ИГРЫ -> UI
  // ===================================================================
  function initUiSubscriptions() {
    on('state:changed', () => {
      renderStatStrip();
    });

    on('state:reset', () => {
      renderStatStrip();
    });

    on('achievement:unlocked', (ach) => {
      showNotification('achievement', ach.icon, `Достижение получено: ${ach.name}`);
    });

    on('reputation:levelup', (level) => {
      showNotification('info', '⭐', `Новый уровень репутации: ${level.name}`);
      levelUpFlash();
    });

    on('player:burnout', () => {
      showNotification('danger', '🔥', 'Здоровье на нуле — выгорание! Доход не начисляется, пока не восстановишься.');
    });

    on('save:done', () => { /* тихое автосохранение, без уведомления */ });
  }

  window.G.ui = {
    initNav,
    setScreen,
    render,
    renderStatStrip,
    openModal,
    closeModal,
    showNotification,
    spawnFloat,
    initUiSubscriptions,
    openTutorial,
  };
})();
