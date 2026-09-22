// =========================================================
// employees.js — найм сотрудников
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};
  const S = window.G.state;
  const state = S.state;
  const notify = S.notify;
  const addReputation = S.addReputation;

  const EMPLOYEE_DEFS = {
    intern: {
      id: 'intern', name: 'Стажёр', icon: '🧑‍💻',
      hireCost: 20000, salaryPerHour: 1000, incomePerHour: 1500,
    },
    manager: {
      id: 'manager', name: 'Менеджер', icon: '🧑‍💼',
      hireCost: 80000, salaryPerHour: 2500, incomePerHour: 4000,
    },
    specialist: {
      id: 'specialist', name: 'Специалист', icon: '👩‍🔧',
      hireCost: 200000, salaryPerHour: 5000, incomePerHour: 8000,
    },
    director: {
      id: 'director', name: 'Директор', icon: '🧑‍✈️',
      hireCost: 600000, salaryPerHour: 10000, incomePerHour: 18000,
    },
  };

  function getEmployeeCount(id) {
    return state.employees[id] || 0;
  }

  function getTotalEmployeeCount() {
    return Object.values(state.employees).reduce((a, b) => a + b, 0);
  }

  function getExtraCapacityFromProperties() {
    const bonuses = { small_office: 2, big_office: 5, business_center: 10, skyscraper: 25 };
    let extra = 0;
    Object.keys(bonuses).forEach((id) => {
      if (state.properties[id]) extra += bonuses[id];
    });
    return extra;
  }

  function getEmployeeCapacity() {
    return 2 + getExtraCapacityFromProperties();
  }

  function canHireMore() {
    return getTotalEmployeeCount() < getEmployeeCapacity();
  }

  function hireEmployee(id) {
    const def = EMPLOYEE_DEFS[id];
    if (!def) return { ok: false, reason: 'not_found' };
    if (window.G.businesses.getOwnedBusinessIds().length === 0) return { ok: false, reason: 'no_business' };
    if (!canHireMore()) return { ok: false, reason: 'capacity' };
    if (state.balance < def.hireCost) return { ok: false, reason: 'not_enough_money' };

    state.balance -= def.hireCost;
    state.employees[id] = (state.employees[id] || 0) + 1;
    state.stats.employeesHired += 1;
    addReputation(3);
    notify('employee:hired', id);
    notify('state:changed');
    return { ok: true };
  }

  function getEmployeeIncomeTotal() {
    return Object.keys(EMPLOYEE_DEFS).reduce((sum, id) => {
      const def = EMPLOYEE_DEFS[id];
      return sum + def.incomePerHour * getEmployeeCount(id);
    }, 0);
  }

  function getEmployeeExpenseTotal() {
    return Object.keys(EMPLOYEE_DEFS).reduce((sum, id) => {
      const def = EMPLOYEE_DEFS[id];
      return sum + def.salaryPerHour * getEmployeeCount(id);
    }, 0);
  }

  window.G.employees = {
    EMPLOYEE_DEFS,
    getEmployeeCount,
    getTotalEmployeeCount,
    getEmployeeCapacity,
    canHireMore,
    hireEmployee,
    getEmployeeIncomeTotal,
    getEmployeeExpenseTotal,
  };
})();
