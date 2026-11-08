// ============================================================
// utils.js — маленькие общие помощники (формат времени, расстояния и т.п.)
// ============================================================
window.STR = window.STR || {};

STR.tg = window.Telegram && window.Telegram.WebApp;   // объект Telegram (или undefined в обычном браузере)

STR.u = (function () {
  const $ = id => document.getElementById(id);

  // Расстояние между двумя точками на Земле (формула гаверсинусов), в метрах
  function haversine(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const x = Math.sin(dLat / 2) ** 2 +
              Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  // Миллисекунды -> «мм:сс» или «ч:мм:сс»
  function fmtTime(ms) {
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
    const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // Секунды -> «мм:сс.сс» (с сотыми долями), для часов «ч:мм:сс.сс»
  function fmtPrecise(sec) {
    const cs = Math.max(0, Math.floor(sec * 100 + 1e-6));
    const c = cs % 100, t = Math.floor(cs / 100);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = n => String(n).padStart(2, '0');
    return (h > 0 ? h + ':' : '') + p(m) + ':' + p(s) + '.' + p(c);
  }

  // Выбираем не больше max элементов, равномерно (первый и последний сохраняются)
  function thin(items, max) {
    if (items.length <= max) return items;
    const out = [];
    for (let i = 0; i < max; i++) out.push(items[Math.round(i * (items.length - 1) / (max - 1))]);
    return out;
  }

  // нажатие на сообщение закрывает его
  document.addEventListener('DOMContentLoaded', () => { const t = $('toast'); if (t) t.addEventListener('click', () => t.classList.remove('show')); });

  return {
    $,
    haversine,
    fmtTime,
    fmtPrecise,
    thin,
    kmh: ms => ms * 3.6,
    fmtKm: m => (m / 1000).toFixed(2) + ' км',
    fmtDate: ts => new Date(ts).toLocaleDateString('ru-RU'),
    // Сообщение пользователю: всплывает сверху и сама исчезает.
    // quiet=true — для частых служебных обновлений (GPS-точки): не показываем, только запоминаем.
    setStatus: (text, quiet) => {
      $('status').textContent = text;
      if (quiet) return;
      const t = $('toast');
      t.textContent = text;
      t.classList.add('show');
      clearTimeout(STR.u._toastTimer);
      STR.u._toastTimer = setTimeout(() => t.classList.remove('show'), Math.min(9000, 3000 + text.length * 40));
    }
  };
})();
