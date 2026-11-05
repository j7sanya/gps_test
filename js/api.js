// ============================================================
// api.js — ВСЁ хранение данных (трассы, рекорды) только здесь.
//
// Сейчас:  официальные трассы читаются из data/routes.json,
//          ваши трассы и рекорды хранятся в памяти телефона (localStorage).
// Потом:   когда появится сервер (например Supabase), мы заменим содержимое
//          ЭТОГО файла, а остальные файлы менять не придётся.
// ============================================================
STR.api = (function () {
  const C = STR.config;

  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  let official = [];   // трассы из data/routes.json

  // Загружаем официальные трассы (вызывается один раз при запуске)
  async function init() {
    try {
      const resp = await fetch(C.ROUTES_URL + '?v=' + C.VERSION, { cache: 'no-cache' });
      const data = await resp.json();
      official = [];
      (data.routes || []).forEach(r => {
        const base = { ...r, id: String(r.id), local: false };
        if (!r.bidirectional) { official.push(base); return; }
        // Двусторонняя трасса: две отдельные трассы, у каждой свой старт, финиш и рекорд.
        // Начало и конец трассы работают и как старт, и как финиш — зависит от направления.
        official.push({ ...base, name: r.name + ' (туда)' });
        official.push({
          ...base,
          id: base.id + '-rev',
          name: r.name + ' (обратно)',
          lines: base.lines.slice().reverse().map(l => l.slice().reverse())
        });
      });
    } catch (e) {
      official = [];
    }
  }

  // Свои трассы с этого телефона
  function localRoutes() {
    const list = readJSON(C.STORE_ROUTES, []);
    // Перенос рекордов из старого формата (рекорд лежал внутри трассы)
    const recs = readJSON(C.STORE_RECORDS, {});
    let changed = false;
    list.forEach(r => {
      if (r.record) {
        if (!recs[r.id]) recs[r.id] = r.record;
        delete r.record;
        changed = true;
      }
    });
    if (changed) { writeJSON(C.STORE_ROUTES, list); writeJSON(C.STORE_RECORDS, recs); }
    return list.map(r => ({ ...r, id: String(r.id), local: true }));
  }

  return {
    init,

    // Все трассы: сначала официальные, потом свои
    getRoutes() { return official.concat(localRoutes()); },

    // Добавить свою трассу. Возвращает true, если удалось сохранить.
    addRoute(route) {
      const list = readJSON(C.STORE_ROUTES, []);
      list.push(route);
      return writeJSON(C.STORE_ROUTES, list);
    },

    // Удалить свою трассу (официальные удалить нельзя) вместе с её рекордом
    deleteRoute(id) {
      id = String(id);
      writeJSON(C.STORE_ROUTES, readJSON(C.STORE_ROUTES, []).filter(r => String(r.id) !== id));
      const recs = readJSON(C.STORE_RECORDS, {});
      delete recs[id];
      writeJSON(C.STORE_RECORDS, recs);
    },

    // Рекорд на трассе: { time (секунды), avgKmh, date } или null
    getRecord(routeId) { return readJSON(C.STORE_RECORDS, {})[String(routeId)] || null; },

    // Записать результат, если он лучше рекорда. Возвращает true, если это новый рекорд.
    submitRecord(routeId, rec) {
      const recs = readJSON(C.STORE_RECORDS, {});
      const id = String(routeId);
      if (recs[id] && recs[id].time <= rec.time) return false;
      recs[id] = rec;
      writeJSON(C.STORE_RECORDS, recs);
      return true;
    }
  };
})();
