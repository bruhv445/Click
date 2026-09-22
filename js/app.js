// =========================================================
// app.js — точка входа: инициализация, интеграция рекламного
// блока Adsgram (Rewarded, blockId 46665).
//
// Игра пошаговая: баланс меняется только по кнопке
// «Следующий день» (см. ui.js -> handleNextDay -> economy.advanceDay).
// Здесь нет игрового тика реального времени — только счётчик
// "время в игре" для статистики и автосохранение.
// =========================================================
(function () {
  'use strict';
  window.G = window.G || {};

  const S = window.G.state;
  const state = S.state;
  const CONFIG = S.CONFIG;

  // ---------------------------------------------------------
  // Telegram Mini App: базовая инициализация (безопасно, если
  // игра открыта вне Telegram — просто ничего не делает)
  // ---------------------------------------------------------
  function initTelegram() {
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (!tg) return;
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor('#0f1420');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#0f1420');
    } catch (e) {
      console.warn('Telegram WebApp SDK недоступен', e);
    }
  }

  // ---------------------------------------------------------
  // Adsgram — три рекламных блока:
  //  1) Rewarded (46665)     — по кнопке, за просмотр +5 кристаллов.
  //     Кристаллы НЕЛЬЗЯ получить никаким другим способом.
  //  2) Interstitial (int-49316) — не вознаграждаемая, показывается
  //     сама на естественном переходе между днями, но только начиная
  //     с 4-го дня и не чаще раза в 3 игровых дня (см. state.js CONFIG),
  //     чтобы не быть навязчивой.
  //  3) Task (task-49318)    — виджет-задание (веб-компонент
  //     <adsgram-task>), встроен в магазин кристаллов; награда
  //     начисляется по событию reward от самого виджета.
  // Во всех случаях реклама необязательна и не блокирует игру.
  // ---------------------------------------------------------
  const ADSGRAM_BLOCK_ID = '46665';
  const AD_REWARD_CRYSTALS = 5;
  const INTERSTITIAL_BLOCK_ID = 'int-49316';
  const TASK_BLOCK_ID = 'task-49318';
  const TASK_REWARD_CRYSTALS = 5;

  let AdController = null;
  let InterstitialController = null;
  let adInProgress = false;

  function initAdsgram() {
    try {
      if (window.Adsgram) {
        AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
        InterstitialController = window.Adsgram.init({ blockId: INTERSTITIAL_BLOCK_ID });
      }
    } catch (e) {
      console.warn('Adsgram SDK недоступен', e);
    }
  }

  function requestRewardedAd() {
    if (adInProgress) return;
    const UI = window.G.ui;

    if (!AdController) {
      UI.showNotification('warn', '⚠️', 'Реклама временно недоступна. Попробуй позже.');
      return;
    }

    adInProgress = true;
    AdController.show()
      .then(() => {
        S.addCrystals(AD_REWARD_CRYSTALS);
        state.stats.adsWatched += 1;
        UI.showNotification('success', '💎', `Получено +${AD_REWARD_CRYSTALS} кристаллов за просмотр рекламы!`);
        UI.renderStatStrip();
        window.G.save.saveGame();
      })
      .catch(() => {
        // пользователь закрыл рекламу раньше времени или произошла ошибка —
        // вознаграждение не начисляется
      })
      .finally(() => {
        adInProgress = false;
      });
  }

  /** Interstitial: показывается сама, без запроса пользователя, и без
   *  вознаграждения. Вызывается из ui.js на естественном переходе
   *  (после закрытия итогов дня), с ограничением по дню/частоте. */
  function maybeShowInterstitial() {
    if (!InterstitialController) return;
    if (state.day < CONFIG.INTERSTITIAL_MIN_DAY) return;
    if (state.day - state.lastInterstitialDay < CONFIG.INTERSTITIAL_INTERVAL_DAYS) return;

    state.lastInterstitialDay = state.day;
    InterstitialController.show().catch(() => {
      // баннер не найден / пользователь закрыл раньше — реклама не
      // вознаграждаемая, так что просто ничего не делаем
    });
  }

  /** Task-виджет начисляет награду через свой собственный DOM-элемент
   *  <adsgram-task> (см. ui.js openCrystalShop) — эта функция вызывается
   *  из обработчика события 'reward' на этом элементе. */
  function onTaskRewarded() {
    const UI = window.G.ui;
    S.addCrystals(TASK_REWARD_CRYSTALS);
    state.stats.adsWatched += 1;
    UI.showNotification('success', '💎', `Задание выполнено: +${TASK_REWARD_CRYSTALS} кристаллов!`);
    UI.renderStatStrip();
    window.G.save.saveGame();
  }

  // ---------------------------------------------------------
  // Счётчик "время в игре" — не влияет на экономику,
  // просто отображается в статистике
  // ---------------------------------------------------------
  let playtimeTimer = null;
  function startPlaytimeClock() {
    if (playtimeTimer) clearInterval(playtimeTimer);
    playtimeTimer = setInterval(() => {
      state.playTimeMs += CONFIG.PLAYTIME_TICK_MS;
    }, CONFIG.PLAYTIME_TICK_MS);
  }

  // ---------------------------------------------------------
  // Инициализация приложения
  // ---------------------------------------------------------
  async function boot() {
    initTelegram();
    initAdsgram();

    await window.G.save.loadGame();

    window.G.ui.initNav();
    window.G.ui.initUiSubscriptions();
    window.G.ui.render();
    window.G.ui.renderStatStrip();

    if (!state.tutorialSeen) {
      window.G.ui.openTutorial();
    }

    startPlaytimeClock();
    window.G.save.startAutosave();

    window.addEventListener('pagehide', () => { window.G.save.saveGame(); });
    window.addEventListener('beforeunload', () => { window.G.save.saveGame(); });
  }

  window.G.app = {
    requestRewardedAd,
    maybeShowInterstitial,
    onTaskRewarded,
    TASK_BLOCK_ID,
  };

  document.addEventListener('DOMContentLoaded', boot);
})();
