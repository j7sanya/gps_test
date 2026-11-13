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
  // Рекорды делятся на два вида старта: 'roll' — «С хода» (время от линии старта), 'stand' — «С места» (время от сигнала светофора).
  const MODES = ['roll', 'stand'];
  const modeOf = m => (m === 'stand' ? 'stand' : 'roll');
  const storeKey = m => (modeOf(m) === 'stand' ? C.STORE_RECORDS_STAND : C.STORE_RECORDS);
  let serverModes = false;   // на сервере уже есть деление рекордов по виду старта (выполнен migration_mode.sql)
  let board = { roll: {}, stand: {} };   // лучшие результаты всех игроков: board[вид][routeId] -> [{ name, time, avgKmh, mine }]

  // Загрузить таблицу рекордов (читать может любой, подпись не нужна)
  async function loadBoard() {
    if (!serverOn()) return false;
    try {
      const base = C.SUPABASE_URL + '/rest/v1/records?select=route_id,tg_id,time_s,avg_kmh,created_at,players(nick,num)';
      const tail = '&order=time_s.asc&limit=1000';
      let hasMode = true;
      let rows = await (await fetch(base.replace('route_id,', 'route_id,mode,') + tail, { headers: hdr() })).json();
      if (!Array.isArray(rows)) {   // на сервере ещё нет колонки mode (не выполнен migration_mode.sql): все рекорды считаем «С хода»
        hasMode = false;
        rows = await (await fetch(base + tail, { headers: hdr() })).json();
      }
      if (!Array.isArray(rows)) return false;
      serverModes = hasMode;
      const me = STR.tg && STR.tg.initDataUnsafe && STR.tg.initDataUnsafe.user ? STR.tg.initDataUnsafe.user.id : null;
      board = { roll: {}, stand: {} };
      rows.forEach(r => {
        const m = hasMode ? modeOf(r.mode) : 'roll';
        (board[m][r.route_id] = board[m][r.route_id] || []).push({
          name: (r.players && r.players.nick) || 'Игрок', num: r.players ? r.players.num : null, time: Number(r.time_s), avgKmh: Number(r.avg_kmh), date: r.created_at ? Date.parse(r.created_at) : null, mine: me !== null && r.tg_id === me
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

  // ---------- Публичные трассы (видят все) ----------
  let pubRoutes = [];
  const myTgId = () => { const u = STR.tg && STR.tg.initDataUnsafe && STR.tg.initDataUnsafe.user; return u ? u.id : null; };

  async function loadPublicRoutes() {
    if (!serverOn()) return false;
    try {
      const url = C.SUPABASE_URL + '/rest/v1/routes?select=id,name,distance,lines,owner,created_at,players(nick)&order=created_at.desc&limit=200';
      const rows = await (await fetch(url, { headers: hdr() })).json();
      if (!Array.isArray(rows)) return false;
      const me = myTgId();
      pubRoutes = rows.map(r => ({
        id: 'pub-' + r.id, name: r.name, distance: Number(r.distance), lines: r.lines,
        created: r.created_at ? Date.parse(r.created_at) : 0, local: false, public: true, author: (r.players && r.players.nick) || 'Игрок', mine: me !== null && r.owner === me
      }));
      return true;
    } catch (e) { return false; }
  }

  // Вызов серверной функции (с проверкой подписи Telegram). Возвращает ответ или { error } при сбое.
  async function callServer(payload) {
    const initData = STR.tg && STR.tg.initData;
    if (!serverOn() || !initData) return { error: 'offline' };
    try {
      const resp = await fetch(C.SUPABASE_URL + '/functions/v1/api', {
        method: 'POST', headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, initData })
      });
      return await resp.json();
    } catch (e) { return { error: 'network' }; }
  }

  // Опубликовать трассу: { name, lines }. Ответ: { ok, id } или { error: 'limit' | 'nick' | 'short' | ... }
  async function publishRoute(route) {
    const r = await callServer({ action: 'publish_route', name: route.name, lines: route.lines });
    if (r && r.ok) await loadPublicRoutes();
    return r;
  }

  // Чужой профиль по номеру (ID в приложении): { nick, num, bio, avatar_url } или null
  async function loadPlayer(num) {
    if (!serverOn()) return null;
    try {
      const rows = await (await fetch(C.SUPABASE_URL + '/rest/v1/players?num=eq.' + encodeURIComponent(num) + '&select=nick,num,bio,avatar_url', { headers: hdr() })).json();
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    } catch (e) { return null; }
  }

  // Ваш профиль на сервере: { nick, num, bio } или null
  let me = null, meError = '';
  async function loadMe() {
    const u = STR.tg && STR.tg.initDataUnsafe && STR.tg.initDataUnsafe.user;
    if (!serverOn()) { meError = 'в js/config.js не вписан ключ SUPABASE_KEY (или файл не обновлён на GitHub)'; return null; }
    if (!u) { meError = 'приложение открыто не из Telegram'; return null; }
    try {
      const rows = await (await fetch(C.SUPABASE_URL + '/rest/v1/players?tg_id=eq.' + u.id + '&select=nick,num,bio,avatar_url', { headers: hdr() })).json();
      if (!Array.isArray(rows)) { me = null; meError = 'сервер ответил ошибкой: ' + (rows && (rows.message || rows.hint) || 'неизвестно') + ' (возможно, не выполнены SQL-файлы в Supabase)'; return null; }
      me = rows.length ? rows[0] : null;
      meError = me ? '' : 'в базе нет вашего профиля: пройдите /start в боте';
    } catch (e) { meError = 'нет связи с сервером'; }
    return me;
  }

  // Сохранить статус профиля (на телефоне всегда, на сервер — если есть подключение и ник)
  async function saveBio(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    writeJSON(C.STORE_BIO, text);
    if (me) me.bio = text || null;
    const initData = STR.tg && STR.tg.initData;
    if (serverOn() && initData && me) {
      try {
        await fetch(C.SUPABASE_URL + '/functions/v1/api', {
          method: 'POST', headers: { ...hdr(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bio', initData, bio: text })
        });
      } catch (e) {}
    }
    return text;
  }

  // Отправить свой рекорд на сервер (сервер проверяет подпись Telegram). Свои трассы не отправляем.
  async function sendRecord(routeId, rec, mode) {
    const initData = STR.tg && STR.tg.initData;
    if (!serverOn() || !initData || String(routeId).startsWith('local-')) return null;
    if (modeOf(mode) === 'stand' && !serverModes) return null;   // сервер ещё не умеет хранить «С места»: не смешиваем с «С хода»
    try {
      const resp = await fetch(C.SUPABASE_URL + '/functions/v1/api', {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record', initData, routeId: String(routeId), time: rec.time, avgKmh: rec.avgKmh, mode: modeOf(mode) })
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
    loadMe,
    loadPlayer,
    saveBio,
    getMe: () => me,
    getMeError: () => meError,
    getBio() { return (me && me.bio) || readJSON(C.STORE_BIO, ''); },
    checkNick,
    sendRecord,
    serverOn,

    // ----- История заездов (на этом телефоне) -----
    addRun(run) {
      const list = readJSON(C.STORE_RUNS, []);
      list.push(run);
      writeJSON(C.STORE_RUNS, list.slice(-500));
    },
    getRuns() { return readJSON(C.STORE_RUNS, []); },
    // Изменить поля заезда (например, поставить звёздочку): id — идентификатор заезда
    updateRun(id, patch) {
      const list = readJSON(C.STORE_RUNS, []);
      const r = list.find(x => (x.id || String(x.date)) === id);
      if (!r) return false;
      Object.assign(r, patch);
      writeJSON(C.STORE_RUNS, list);
      return true;
    },
    // Личная статистика по истории заездов
    getStats() {
      const runs = readJSON(C.STORE_RUNS, []);
      let dist = 0, secs = 0, maxKmh = 0, bestAvg = 0;
      runs.forEach(r => {
        dist += r.dist || 0; secs += r.time || 0;
        maxKmh = Math.max(maxKmh, r.maxKmh || 0); bestAvg = Math.max(bestAvg, r.avgKmh || 0);
      });
      return {
        runs: runs.length,
        records: Object.keys(readJSON(C.STORE_RECORDS, {})).length + Object.keys(readJSON(C.STORE_RECORDS_STAND, {})).length,
        km: dist / 1000,
        avgKmh: secs > 0 ? (dist / secs) * 3.6 : 0,   // средняя за всё время в пути
        maxKmh, bestAvg
      };
    },
    // Сколько таблиц (трасса + вид старта), где вы на 1-м месте
    getFirstPlaces() { let n = 0; MODES.forEach(m => Object.keys(board[m]).forEach(id => { if (board[m][id][0] && board[m][id][0].mine) n++; })); return n; },

    // Лучший результат всех игроков на трассе (в таблице нужного вида старта) или null
    getBest(routeId, mode) { const l = board[modeOf(mode)][String(routeId)]; return l && l.length ? l[0] : null; },
    // Лучший из двух таблиц: { x, mode } или null
    getBestAny(routeId) {
      let out = null;
      MODES.forEach(m => { const x = this.getBest(routeId, m); if (x && (!out || x.time < out.x.time)) out = { x, mode: m }; });
      return out;
    },
    // Результаты игрока (по номеру профиля) на всех трассах: места, время, средняя скорость, вид старта
    getPlayerResults(num) {
      const out = [];
      MODES.forEach(m => Object.keys(board[m]).forEach(id => {
        const i = board[m][id].findIndex(x => x.num === num);
        if (i < 0) return;
        const route = (official.concat(pubRoutes)).find(r => String(r.id) === id) || localRoutes().find(r => String(r.id) === id);
        if (!route) return;   // трасса удалена
        const x = board[m][id][i];
        out.push({ routeId: id, routeName: route.name, mode: m, rank: i + 1, total: board[m][id].length, time: x.time, avgKmh: x.avgKmh });
      }));
      return out.sort((a, b) => a.rank - b.rank || a.time - b.time);
    },
    // Сколько публичных трасс создал игрок с таким ником
    countRoutesBy(nick) { return pubRoutes.filter(r => r.author === nick).length; },

    // Все результаты на трассе, от лучшего к худшему: [{ name, time, avgKmh, date, mine }]
    getBoard(routeId, mode) { return (board[modeOf(mode)][String(routeId)] || []).slice(); },
    // Место игрока на трассе (1, 2…) или null
    getMyRank(routeId, mode) { const l = board[modeOf(mode)][String(routeId)] || []; const i = l.findIndex(x => x.mine); return i < 0 ? null : i + 1; },

    // Все трассы: официальные, публичные (от игроков), потом ваши локальные
    getRoutes() { return official.concat(pubRoutes, localRoutes()); },
    loadPublicRoutes,
    publishRoute,
    // Сколько публичных трасс создали вы
    myPublicCount() { return pubRoutes.filter(r => r.mine).length; },

    // Добавить свою трассу. Возвращает true, если удалось сохранить.
    addRoute(route) {
      const list = readJSON(C.STORE_ROUTES, []);
      list.push(route);
      return writeJSON(C.STORE_ROUTES, list);
    },

    // Удалить свою трассу (официальные удалить нельзя) вместе с её рекордом
    async deleteRoute(id) {
      id = String(id);
      if (id.startsWith('pub-')) {   // публичная трасса: удаляем на сервере (вместе с рекордами на ней)
        const r = await callServer({ action: 'delete_route', routeId: id });
        if (!r || !r.ok) return false;
        await loadPublicRoutes();
        MODES.forEach(m => { const recs0 = readJSON(storeKey(m), {}); delete recs0[id]; writeJSON(storeKey(m), recs0); });
        return true;
      }
      writeJSON(C.STORE_ROUTES, readJSON(C.STORE_ROUTES, []).filter(r => String(r.id) !== id));
      MODES.forEach(m => { const recs = readJSON(storeKey(m), {}); delete recs[id]; writeJSON(storeKey(m), recs); });
      return true;
    },

    // Рекорд на трассе для вида старта ('roll' — с хода, 'stand' — с места): { time (секунды), avgKmh, date } или null
    getRecord(routeId, mode) { return readJSON(storeKey(mode), {})[String(routeId)] || null; },
    // Лучший личный рекорд из двух видов: { rec, mode } или null
    getRecordAny(routeId) {
      let out = null;
      MODES.forEach(m => { const r = this.getRecord(routeId, m); if (r && (!out || r.time < out.rec.time)) out = { rec: r, mode: m }; });
      return out;
    },

    // Записать результат, если он лучше рекорда этого вида старта. Возвращает true, если это новый рекорд.
    submitRecord(routeId, rec, mode) {
      const key = storeKey(mode);
      const recs = readJSON(key, {});
      const id = String(routeId);
      if (recs[id] && recs[id].time <= rec.time) return false;
      recs[id] = rec;
      writeJSON(key, recs);
      return true;
    }
  };
})();
