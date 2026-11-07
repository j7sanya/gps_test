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

  // ---------- Сервер (Supabase): общие рекорды ----------
  // Работает, только если в config.js указан ключ. Без него приложение просто работает локально.
  const serverOn = () => !!(C.SUPABASE_URL && C.SUPABASE_KEY);
  const hdr = () => ({ apikey: C.SUPABASE_KEY, Authorization: 'Bearer ' + C.SUPABASE_KEY });
  let board = {};      // лучшие результаты всех игроков: routeId -> [{ name, time, avgKmh, mine }]

  // Загрузить таблицу рекордов (читать может любой, подпись не нужна)
  async function loadBoard() {
    if (!serverOn()) return false;
    try {
      const url = C.SUPABASE_URL + '/rest/v1/records?select=route_id,tg_id,time_s,avg_kmh,created_at,players(nick)&order=time_s.asc&limit=1000';
      const rows = await (await fetch(url, { headers: hdr() })).json();
      if (!Array.isArray(rows)) return false;
      const me = STR.tg && STR.tg.initDataUnsafe && STR.tg.initDataUnsafe.user ? STR.tg.initDataUnsafe.user.id : null;
      board = {};
      rows.forEach(r => {
        (board[r.route_id] = board[r.route_id] || []).push({
          name: (r.players && r.players.nick) || 'Игрок', time: Number(r.time_s), avgKmh: Number(r.avg_kmh), date: r.created_at ? Date.parse(r.created_at) : null, mine: me !== null && r.tg_id === me
        });
      });
      return true;
    } catch (e) { return false; }
  }

  // Есть ли у вас ник (его задают в боте). 'ok' | 'none' | 'unknown' (нет сервера, не в Telegram или нет сети)
  async function checkNick() {
    const u = STR.tg && STR.tg.initDataUnsafe && STR.tg.initDataUnsafe.user;
    if (!serverOn() || !u) return 'unknown';
    try {
      const rows = await (await fetch(C.SUPABASE_URL + '/rest/v1/players?tg_id=eq.' + u.id + '&select=nick', { headers: hdr() })).json();
      if (!Array.isArray(rows)) return 'unknown';
      return rows.length && rows[0].nick ? 'ok' : 'none';
    } catch (e) { return 'unknown'; }
  }

  // Отправить свой рекорд на сервер (сервер проверяет подпись Telegram). Свои трассы не отправляем.
  async function sendRecord(routeId, rec) {
    const initData = STR.tg && STR.tg.initData;
    if (!serverOn() || !initData || String(routeId).startsWith('local-')) return null;
    try {
      const resp = await fetch(C.SUPABASE_URL + '/functions/v1/api', {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record', initData, routeId: String(routeId), time: rec.time, avgKmh: rec.avgKmh })
      });
      const data = await resp.json();
      if (data && data.ok) loadBoard();
      return data;
    } catch (e) { return null; }
  }

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
    loadBoard,
    checkNick,
    sendRecord,
    serverOn,

    // Лучший результат всех игроков на трассе или null
    getBest(routeId) { const l = board[String(routeId)]; return l && l.length ? l[0] : null; },
    // Все результаты на трассе, от лучшего к худшему: [{ name, time, avgKmh, date, mine }]
    getBoard(routeId) { return (board[String(routeId)] || []).slice(); },
    // Место игрока на трассе (1, 2…) или null
    getMyRank(routeId) { const l = board[String(routeId)] || []; const i = l.findIndex(x => x.mine); return i < 0 ? null : i + 1; },

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
