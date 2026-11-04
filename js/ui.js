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
      $('sTime').textContent = U.fmtTime(elapsed);
      $('sDist').textContent = (s.distance / 1000).toFixed(2);
      $('sSpeed').textContent = Math.round(U.kmh(s.speedNow));
      $('sAvg').textContent = Math.round(U.kmh(avg));
      $('sMax').textContent = Math.round(U.kmh(s.maxSpeed));
      $('sGap').textContent = Math.round(s.maxGap);
    },

    // Кнопка «Начать / Остановить»
    setRecording(on, afterStopText) {
      const b = $('btn');
      if (on) { b.textContent = '■ Остановить'; b.classList.add('stop'); }
      else    { b.textContent = afterStopText || '▶ Начать запись'; b.classList.remove('stop'); }
    },

    // Зелёная кнопка «Сохранить как трассу»
    showSave(on) { $('saveBtn').style.display = on ? 'block' : 'none'; }
  };
})();
