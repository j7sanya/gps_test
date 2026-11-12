// ============================================================
// launch.js — старт с места: подсказка «рядом старт», подготовка, светофор, фальстарт.
//
// Как это работает:
//  1. Пока вы стоите (или едете медленнее 10 км/ч) ближе 60 м к старту любой трассы,
//     снизу появляется карточка «Рядом старт». Трассу можно выбрать и вручную: меню → «Трассы рядом».
//  2. Подготовка: приложение проверяет, что вы на линии старта, стоите и GPS достаточно точный.
//  3. «Я готов» запускает светофор (стиль выбирается в Настройках → Светофор).
//  4. Время заезда идёт от сигнала «зелёный». Если до сигнала вы сдвинулись больше чем на 10 м — фальстарт.
// Сам заезд (трасса, финиш, рекорд) ведёт run.js, как и при старте «с хода».
// ============================================================
STR.launch = (function () {
  const C = STR.config, U = STR.u, $ = U.$;
  const KEY = 'strace_launch_v1';

  // Стили отсчёта. events: at — когда (мс от нажатия «Я готов»), k — номер кадра, go — момент старта
  const STYLES = [
    ['tl',   'Светофор (3 огня)'],
    ['tree', '«Ёлка» как в драг-рейсинге'],
    ['f1',   'Формула-1: 5 огней'],
    ['num',  'Цифры 3 · 2 · 1']
  ];
  const TL = {
    tl: {
      events: [{ at: 0, k: 0, quiet: true }, { at: 1000, k: 1 }, { at: 2000, k: 2 }, { at: 3000, k: 3, go: true }],
      hint: 'Красный → красный + жёлтый → зелёный',
      build: el => { el.innerHTML = '<div class="tl"><div class="lamp"></div><div class="lamp"></div><div class="lamp"></div></div><div class="lo-cap">Приготовьтесь</div>'; },
      show(el, k) {
        const l = el.querySelectorAll('.lamp'); l.forEach(x => x.className = 'lamp');
        if (k >= 1 && k < 3) l[0].classList.add('r');
        if (k === 2) l[1].classList.add('y');
        if (k === 3) l[2].classList.add('g');
        el.querySelector('.lo-cap').textContent = k === 3 ? '' : (k ? 'Ждите зелёный' : 'Приготовьтесь');
      },
      previewK: 2
    },
    tree: {
      events: [{ at: 0, k: 0, quiet: true }, { at: 800, k: 1 }, { at: 1400, k: 2 }, { at: 2000, k: 3 }, { at: 2800, k: 4, go: true }],
      hint: 'Три жёлтых огня по очереди, затем зелёный',
      build: el => { el.innerHTML = '<div class="tree"><div class="lamp"></div><div class="lamp"></div><div class="lamp"></div><div class="lamp"></div></div><div class="lo-cap">Приготовьтесь</div>'; },
      show(el, k) {
        const l = el.querySelectorAll('.lamp'); l.forEach(x => x.className = 'lamp');
        if (k >= 1 && k <= 3) for (let i = 0; i < k; i++) l[i].classList.add('o');
        if (k === 4) l[3].classList.add('g');
        el.querySelector('.lo-cap').textContent = k === 4 ? '' : (k ? 'Ждите зелёный' : 'Приготовьтесь');
      },
      previewK: 3
    },
    f1: {
      events: [{ at: 0, k: 0, quiet: true }, { at: 800, k: 1 }, { at: 1600, k: 2 }, { at: 2400, k: 3 }, { at: 3200, k: 4 }, { at: 4000, k: 5 }, { at: 4800, k: 6, go: true }],
      hint: 'Пять красных огней загораются, затем гаснут: это старт',
      build: el => {
        let c = ''; for (let i = 0; i < 5; i++) c += '<div class="col"><div class="lamp"></div><div class="lamp"></div></div>';
        el.innerHTML = `<div class="f1">${c}</div><div class="lo-cap">Приготовьтесь</div>`;
      },
      show(el, k) {
        el.querySelectorAll('.col').forEach((col, i) => col.querySelectorAll('.lamp').forEach(l => { l.className = 'lamp' + (i < k && k < 6 ? ' r' : ''); }));
        el.querySelector('.lo-cap').textContent = k === 6 ? '' : (k ? 'Огни погаснут — старт' : 'Приготовьтесь');
      },
      previewK: 3
    },
    num: {
      events: [{ at: 0, k: 0 }, { at: 1000, k: 1 }, { at: 2000, k: 2 }, { at: 3000, k: 3, go: true }],
      hint: 'Большие цифры 3, 2, 1 — удобно при ярком солнце',
      build: el => { el.innerHTML = '<div class="ring"><b>3</b></div><div class="lo-cap">Приготовьтесь</div>'; },
      show(el, k) { el.querySelector('b').textContent = k === 3 ? '0' : String(3 - k); el.querySelector('.lo-cap').textContent = ''; },
      previewK: 1
    }
  };

  // ---------- Настройки (хранятся на телефоне) ----------
  let cfg = { style: 'tl', suggest: true, sound: false, haptic: true };
  try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); if (x) cfg = Object.assign(cfg, x); } catch (e) {}
  if (!TL[cfg.style]) cfg.style = 'tl';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };

  // ---------- Состояние ----------
  let state = 'idle';            // idle | prepare | countdown | false | demo
  let route = null;              // выбранная трасса (подготовленная в run.js)
  let prev = null, last = null, speedKmh = null;   // последние GPS-точки и скорость
  let dwellSince = null, suggestId = null;
  const dismissed = {};          // трассы, для которых нажали «Не сейчас»
  let recent = [];               // последние точки (чтобы найти место старта без «дрожания»)
  let P0 = null;                 // где стояли в момент «Я готов»
  let seq = null, prepTimer = null, closeTimer = null;
  let ac = null;                 // звук

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDist = m => m < 1000 ? Math.round(m) + ' м' : (m / 1000).toFixed(1) + ' км';
  const busy = () => state !== 'idle';

  // ---------- Геометрия ----------
  const distToStart = (pr, p) => { const q = pr.toXY(p), g = pr.start.c; return Math.hypot(q[0] - g[0], q[1] - g[1]); };
  function nearList(p, maxM) {
    return STR.run.getPrepared().map(pr => ({ pr, d: distToStart(pr, p) })).filter(x => x.d <= maxM).sort((a, b) => a.d - b.d);
  }
  function calcSpeed(p) {
    let v = null;
    if (p.speed != null && p.speed >= 0) v = p.speed * 3.6;
    else if (prev && p.t > prev.t) v = U.haversine(prev, p) / ((p.t - prev.t) / 1000) * 3.6;
    prev = p;
    return v;
  }

  // ---------- Отклик: вибрация и звук ----------
  function audioInit() {
    if (!cfg.sound) return;
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {}
  }
  function beep(f, d) {
    if (!cfg.sound || !ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = f; g.gain.value = 0.25; o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + d);
    } catch (e) {}
  }
  function feedback(go) {
    if (cfg.haptic) {
      try { const h = STR.tg.HapticFeedback; if (go) h.notificationOccurred('success'); else h.impactOccurred('light'); } catch (e) {}
    }
    go ? beep(900, 0.5) : beep(520, 0.12);
  }

  // ---------- Карточка над нижней панелью ----------
  const card = () => $('launchCard');
  function showCard(html) { card().innerHTML = html; card().classList.add('open'); }
  function hideCard() { card().classList.remove('open'); card().innerHTML = ''; suggestId = null; }
  const recText = pr => { const r = STR.api.getRecord(pr.id); return r ? 'ваш рекорд ' + U.fmtPrecise(r.time) : 'вы тут ещё не ездили'; };

  function showSuggest(list) {
    const x = list[0]; suggestId = x.pr.id;
    const more = list.length > 1 ? `<div class="lc-more" data-act="more">ещё ${list.length - 1} рядом ›</div>` : '';
    showCard(`<b>🏁 ${esc(x.pr.name)} — старт рядом</b>
      <small>${fmtDist(x.d)} от линии · ${(x.pr.distance / 1000).toFixed(1)} км · ${recText(x.pr)}</small>${more}
      <div class="lc-two"><button data-act="start">Старт с места</button><button class="alt" data-act="later">Не сейчас</button></div>`);
  }

  function renderPrepare() {
    showCard(`<b>${esc(route.name)} · старт с места</b>
      <div class="lc-chk" id="lcLine"></div><div class="lc-chk" id="lcStill"></div><div class="lc-chk" id="lcGps"></div>
      <button id="lcReady" data-act="ready">Я готов — запустить светофор</button>
      <button class="alt lc-small" data-act="cancel">Отмена</button>`);
    refreshPrepare();
  }

  function checks() {
    const p = last;
    if (!p) return { ok: false, line: { ok: false, t: 'Определяю местоположение…' }, still: { ok: false, t: 'Стоите на месте' }, gps: { ok: false, t: 'Ищу GPS-сигнал…' } };
    const d = distToStart(route, p), fresh = Date.now() - p.t <= 5000;
    const line = d <= C.LAUNCH_ONLINE_M, still = speedKmh !== null && speedKmh <= C.LAUNCH_STILL_KMH, gps = p.acc <= C.LAUNCH_ACC_M && fresh;
    return {
      ok: line && still && gps,
      line: { ok: line, t: line ? `На линии старта (${Math.round(d)} м)` : `До старта ${fmtDist(d)}` },
      still: { ok: still, t: still ? 'Стоите на месте' : (speedKmh === null ? 'Определяю скорость…' : `Скорость ${Math.round(speedKmh)} км/ч — остановитесь`) },
      gps: { ok: gps, t: gps ? `GPS ±${Math.round(p.acc)} м — хороший` : (fresh ? `GPS слабый ±${Math.round(p.acc)} м` : 'GPS не обновляется') }
    };
  }
  function refreshPrepare() {
    if (state !== 'prepare' || !$('lcReady')) return;
    const c = checks();
    [['lcLine', c.line], ['lcStill', c.still], ['lcGps', c.gps]].forEach(([id, r]) => {
      $(id).innerHTML = `<i class="${r.ok ? '' : 'no'}">${r.ok ? '✓' : '✕'}</i><span>${esc(r.t)}</span>`;
    });
    $('lcReady').disabled = !c.ok;
  }

  // ---------- Выбор трассы и подготовка ----------
  function choose(id, fit) {
    const pr = STR.run.getPrepared().find(x => x.id === String(id));
    if (!pr) return;
    if (STR.run.isActive()) { U.setStatus('Сначала завершите текущий заезд.'); return; }
    if (STR.gps.isRecording()) { U.setStatus('Сначала остановите запись трассы.'); return; }
    if (STR.run.isDone()) STR.run.cancel();            // закрываем окно прошлого результата
    route = pr; state = 'prepare'; recent = []; P0 = null;
    hideCard();
    STR.map.showRoute(pr.lines, !!fit);
    if (STR.gps.holdScreen) STR.gps.holdScreen();      // экран не гаснет
    STR.gps.startWatching();
    renderPrepare();
    clearInterval(prepTimer); prepTimer = setInterval(refreshPrepare, 1000);
  }

  function leave() {                                   // выход из подготовки / отсчёта
    clearInterval(prepTimer); prepTimer = null;
    if (seq) { seq.cancel(); seq = null; }
    clearTimeout(closeTimer);
    $('launchOverlay').classList.remove('open', 'go', 'bad');
    hideCard();
    state = 'idle'; route = null;
    if (STR.run && !STR.run.isActive()) { STR.map.clearRoute(); if (STR.gps.releaseScreen) STR.gps.releaseScreen(); }
  }

  // ---------- Отсчёт ----------
  function runSeq(style, onGo) {
    const tl = TL[style], body = $('loBody'), t0 = Date.now(), timers = [];
    let dead = false;
    tl.build(body);
    $('launchOverlay').classList.remove('go', 'bad'); $('launchOverlay').classList.add('open');
    tl.events.forEach(e => timers.push(setTimeout(() => {
      if (dead) return;
      tl.show(body, e.k);
      if (!e.quiet) feedback(!!e.go);
      if (e.go) onGo(Date.now() - (t0 + e.at), t0 + e.at);
    }, e.at)));
    return { cancel() { dead = true; timers.forEach(clearTimeout); } };
  }

  function showGoFlash() {
    const o = $('launchOverlay');
    o.classList.add('go');
    $('loBody').innerHTML = '<div class="lo-go">ПОЕХАЛИ!</div>';
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { o.classList.remove('open', 'go'); }, 1100);
  }

  function ready() {
    if (state !== 'prepare' || !checks().ok) return;
    audioInit();
    const pts = recent.slice(-3);
    const src = pts.length ? pts : [last];
    P0 = { lat: src.reduce((a, p) => a + p.lat, 0) / src.length, lon: src.reduce((a, p) => a + p.lon, 0) / src.length };
    clearInterval(prepTimer); prepTimer = null;
    hideCard();
    state = 'countdown';
    $('loBtns').innerHTML = '<button class="alt" data-act="abort">Отмена</button>';
    seq = runSeq(cfg.style, (late, goAt) => {
      seq = null;
      if (late > 400) { fail('Отсчёт сбился (приложение тормозит). Повторите.'); return; }
      const ok = STR.run.startStanding(route.id, goAt);   // секундомер идёт от сигнала «зелёный»
      state = 'idle'; route = null;
      if (!ok) U.setStatus('Не удалось запустить заезд. Проверьте GPS и повторите.');
      showGoFlash();
    });
  }

  function fail(text) {                                // сбой отсчёта: возвращаемся к подготовке
    if (seq) { seq.cancel(); seq = null; }
    $('launchOverlay').classList.remove('open', 'go', 'bad');
    U.setStatus(text);
    if (route) { state = 'prepare'; renderPrepare(); clearInterval(prepTimer); prepTimer = setInterval(refreshPrepare, 1000); }
    else leave();
  }

  function falseStart() {
    if (seq) { seq.cancel(); seq = null; }
    state = 'false';
    try { if (cfg.haptic) STR.tg.HapticFeedback.notificationOccurred('error'); } catch (e) {}
    const o = $('launchOverlay'); o.classList.remove('go'); o.classList.add('open', 'bad');
    $('loBody').innerHTML = `<div class="lo-bad">Фальстарт</div><div class="lo-sub">Вы тронулись до зелёного.<br>Вернитесь на линию и повторите.</div>`;
    $('loBtns').innerHTML = '<button data-act="retry">Повторить</button><button class="alt" data-act="abort2">Отмена</button>';
  }

  // Пробный запуск отсчёта из настроек (без заезда)
  function demo(style) {
    if (busy() || STR.run.isActive()) return;
    audioInit();
    state = 'demo';
    $('loBtns').innerHTML = '<button class="alt" data-act="demoStop">Закрыть</button>';
    seq = runSeq(style || cfg.style, () => {
      seq = null; showGoFlash();
      clearTimeout(closeTimer); closeTimer = setTimeout(() => { $('launchOverlay').classList.remove('open', 'go'); state = 'idle'; }, 1400);
    });
  }
  // Кадр для превью в настройках
  function drawPreview(el, style) { const tl = TL[style]; tl.build(el); tl.show(el, tl.previewK); const c = el.querySelector('.lo-cap'); if (c) c.textContent = ''; }

  // ---------- Поток GPS-точек (из gps.js) ----------
  function onFix(p) {
    last = p;
    speedKmh = calcSpeed(p);
    if (p.acc <= 30) { recent.push(p); if (recent.length > 4) recent.shift(); }

    if (state === 'prepare') { refreshPrepare(); return; }
    if (state === 'countdown') {
      if (P0 && p.acc <= 25 && U.haversine(P0, p) > C.LAUNCH_FALSE_START_M) falseStart();
      return;
    }
    if (state !== 'idle') return;

    // Подсказка «рядом старт»
    const prepared = STR.run.getPrepared();
    for (const id in dismissed) {                       // после «Не сейчас» молчим, пока не отъедете от старта
      const pr = prepared.find(x => x.id === id);
      if (!pr || distToStart(pr, p) > 150) delete dismissed[id];
    }
    const blocked = !cfg.suggest || STR.run.isActive() || STR.run.isDone() || STR.gps.isRecording() || (STR.builder && STR.builder.isActive());
    const list = blocked ? [] : nearList(p, C.LAUNCH_SUGGEST_M).filter(x => !dismissed[x.pr.id]);
    const slow = speedKmh !== null && speedKmh < C.LAUNCH_SUGGEST_KMH && p.acc <= 30;
    if (list.length && slow) {
      if (dwellSince === null) dwellSince = p.t;
      if (p.t - dwellSince >= 2000 && !(suggestId && card().classList.contains('open') && suggestId === list[0].pr.id)) showSuggest(list);
    } else {
      dwellSince = null;
      if (suggestId) {                                  // карточку убираем, когда отъехали или поехали быстро
        const far = !nearList(p, 100).some(x => x.pr.id === suggestId);
        if (blocked || far || (speedKmh !== null && speedKmh > 15)) hideCard();
      }
    }
  }

  // ---------- Кнопки ----------
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'start') choose(suggestId);
    else if (act === 'later') { if (suggestId) dismissed[suggestId] = 1; hideCard(); }
    else if (act === 'more') { STR.settings && STR.settings.openNear(); }
    else if (act === 'ready') ready();
    else if (act === 'cancel') leave();
    else if (act === 'abort') fail('Отсчёт отменён.');
    else if (act === 'retry') { $('launchOverlay').classList.remove('open', 'bad'); state = 'prepare'; renderPrepare(); clearInterval(prepTimer); prepTimer = setInterval(refreshPrepare, 1000); }
    else if (act === 'abort2') leave();
    else if (act === 'demoStop') { if (seq) { seq.cancel(); seq = null; } clearTimeout(closeTimer); $('launchOverlay').classList.remove('open', 'go'); state = 'idle'; }
  });

  // Свернули приложение во время отсчёта — отсчёт сбивается
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (state === 'countdown') fail('Отсчёт прерван: приложение было свернуто.');
    else if (state === 'demo') { if (seq) { seq.cancel(); seq = null; } $('launchOverlay').classList.remove('open', 'go'); state = 'idle'; }
  });

  return {
    onFix, busy, choose, demo, drawPreview,
    styles: STYLES, hints: Object.fromEntries(Object.keys(TL).map(k => [k, TL[k].hint])),
    cfg: () => Object.assign({}, cfg),
    set(k, v) { cfg[k] = v; save(); if (k === 'suggest' && !v) hideCard(); },
    lastFix: () => last
  };
})();
