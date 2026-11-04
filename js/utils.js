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

  // Выбираем не больше max элементов, равномерно (первый и последний сохраняются)
  function thin(items, max) {
    if (items.length <= max) return items;
    const out = [];
    for (let i = 0; i < max; i++) out.push(items[Math.round(i * (items.length - 1) / (max - 1))]);
    return out;
  }

  return {
    $,
    haversine,
    fmtTime,
    thin,
    kmh: ms => ms * 3.6,
    fmtKm: m => (m / 1000).toFixed(2) + ' км',
    fmtDate: ts => new Date(ts).toLocaleDateString('ru-RU'),
    setStatus: text => { $('status').textContent = text; }
  };
})();
