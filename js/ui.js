// ============================================================
// ui.js — нижняя панель: цифры (время, скорость…) и состояние кнопок.
// ============================================================
STR.ui = (function () {
  const U = STR.u, $ = U.$;

  return {
    // Обновить цифры по данным текущей записи s
    render(s) {
      const end = s.stopT || Date.now();
      const elapsed = end - s.startT;
      const avg = elapsed > 0 ? s.distance / (elapsed / 1000) : 0;
      $('sSpeed').textContent = Math.round(U.kmh(s.speedNow));
      $('sMax').textContent = Math.round(U.kmh(s.maxSpeed));
      $('sAvg').textContent = Math.round(U.kmh(avg));
      $('sDist').textContent = (s.distance / 1000).toFixed(2);
    },

    // Обнулить цифры
    clearStats() {
      ['sSpeed', 'sMax', 'sAvg'].forEach(id => { $(id).textContent = '0'; });
      $('sDist').textContent = '0.00';
    },

    // Круглая кнопка: 'start' (+), 'stop' (■ — остановить запись), 'cancel' (✕ — отменить заезд)
    setFab(kind) {
      const b = $('btn');
      const icons = {
        start:  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M12 4v16M4 12h16"/></svg>',
        stop:   '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
        cancel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
      };
      const titles = { start: 'Начать запись', stop: 'Остановить запись', cancel: 'Отменить заезд' };
      b.innerHTML = icons[kind];
      b.title = titles[kind]; b.setAttribute('aria-label', titles[kind]);
      b.classList.toggle('stop', kind !== 'start');
    },
    setRecording(on) { this.setFab(on ? 'stop' : 'start'); },
    setRunning(on) { this.setFab(on ? 'cancel' : 'start'); },

    // Зелёная кнопка «Сохранить как трассу»
    showSave(on) { $('saveBtn').style.display = on ? 'block' : 'none'; }
  };
})();
