// =========================================================
// save.js — сохранение прогресса.
// Сейчас: localStorage. Архитектура рассчитана так, чтобы
// позже подключить Telegram CloudStorage без переписывания
// остальной игры — достаточно заменить набор драйверов ниже.
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};
  const S = window.G.state;
  const state = S.state;
  const CONFIG = S.CONFIG;
  const notify = S.notify;

  const localStorageDriver = {
    getItem(key) {
      try {
        return Promise.resolve(localStorage.getItem(key));
      } catch (e) {
        console.warn('localStorage недоступен', e);
        return Promise.resolve(null);
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.warn('localStorage недоступен, сохранение пропущено', e);
      }
      return Promise.resolve();
    },
  };

  function getCloudStorage() {
    try {
      return (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.CloudStorage) || null;
    } catch (e) {
      return null;
    }
  }

  const cloudStorageDriver = {
    getItem(key) {
      const cloud = getCloudStorage();
      if (!cloud) return Promise.resolve(null);
      return new Promise((resolve) => {
        cloud.getItem(key, (err, value) => {
          if (err) { resolve(null); return; }
          resolve(value || null);
        });
      });
    },
    setItem(key, value) {
      const cloud = getCloudStorage();
      if (!cloud) return Promise.resolve();
      return new Promise((resolve) => {
        cloud.setItem(key, value, () => resolve());
      });
    },
  };

  function getActiveDrivers() {
    const drivers = [localStorageDriver];
    if (getCloudStorage()) drivers.push(cloudStorageDriver);
    return drivers;
  }

  async function saveGame() {
    state.lastSave = Date.now();
    const payload = JSON.stringify(state);
    const drivers = getActiveDrivers();
    await Promise.all(drivers.map((d) => d.setItem(CONFIG.STORAGE_KEY, payload)));
    notify('save:done');
  }

  async function loadGame() {
    const drivers = getActiveDrivers();
    for (const driver of drivers) {
      try {
        const raw = await driver.getItem(CONFIG.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          S.replaceState(parsed);
          notify('save:loaded');
          return true;
        }
      } catch (e) {
        console.warn('Ошибка загрузки сохранения', e);
      }
    }
    return false;
  }

  function hasSave() {
    try {
      return !!localStorage.getItem(CONFIG.STORAGE_KEY);
    } catch (e) {
      return false;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
    } catch (e) { /* ignore */ }
    const cloud = getCloudStorage();
    if (cloud) cloud.removeItem(CONFIG.STORAGE_KEY, () => {});
  }

  let autosaveTimer = null;
  function startAutosave() {
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = setInterval(() => { saveGame(); }, CONFIG.SAVE_INTERVAL_MS);
  }

  window.G.save = {
    saveGame,
    loadGame,
    hasSave,
    clearSave,
    startAutosave,
  };
})();
