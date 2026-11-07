// ============================================================
// run.js — заезд по трассе.
//
// Как это работает:
//  1. Все трассы превращаются в «ворота»: линия старта и линия финиша (в одной точке),
//     перпендикулярные направлению движения.
//  2. Как только вы пересекаете линию старта в нужную сторону (скорость не меньше ~11 км/ч),
//     запускается секундомер, а трасса показывается на карте.
//     Момент пересечения вычисляется между двумя GPS-точками, поэтому время точнее одной секунды.
//  3. Во время заезда считается, насколько вы отклонились от линии трассы.
//     Больше 50 м — время продолжает идти, но рекорд не засчитывается.
//  4. Пересекли линию финиша (после прохождения почти всей трассы) — секундомер останавливается.
//
// Заезды работают, только пока Mini App открыт на переднем плане.
// ============================================================
STR.run = (function () {
  const C = STR.config, U = STR.u, $ = U.$;

  let prepared = [];                    // подготовленные трассы
  let run = null;                       // активный заезд
  let mode = 'idle';                    // idle | running | done
  let rafId = null;                     // анимация секундомера
  let cooldownUntil = 0;                // до какого момента (время GPS, мс) не стартуем новый заезд
  const filter = { last: null, speed: null };   // собственный фильтр GPS-точек для заездов
  let pending = null;                   // пересечена линия старта, ждём подтверждения (см. RUN_START_CONFIRM_M)
  let lastPanelT = 0;                   // когда в последний раз обновляли нижнюю панель

  // ---------- Геометрия ----------
  const unit = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };

  // Расстояние от точки P до отрезка AB и положение проекции (0..1)
  function distToSeg(P, A, B) {
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / len2));
    return { dist: Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy)), t };
  }

  // Подготовка трассы: координаты в метрах, длины, ворота старта и финиша
  function prepare(route) {
    const flat = [];
    (route.lines || []).forEach(l => l.forEach(p => flat.push(p)));
    if (flat.length < 2) return null;

    const lat0 = flat[0][0], lon0 = flat[0][1];
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
    const toXY = p => {
      const lat = Array.isArray(p) ? p[0] : p.lat, lon = Array.isArray(p) ? p[1] : p.lon;
      return [(lon - lon0) * kx, (lat - lat0) * ky];
    };
    const xy = flat.map(toXY);
    const cum = [0];
    for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
    const total = cum[cum.length - 1];
    if (total < 100) return null;

    // Точка на трассе на расстоянии s от начала
    const pointAt = s => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const seg = cum[i] - cum[i - 1] || 1;
      const t = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
      return [xy[i - 1][0] + t * (xy[i][0] - xy[i - 1][0]), xy[i - 1][1] + t * (xy[i][1] - xy[i - 1][1])];
    };
    const gate = (c, d) => ({ c, d, n: [-d[1], d[0]] });
    const p40 = pointAt(40), pEnd40 = pointAt(total - 40), last = xy[xy.length - 1];

    return {
      id: String(route.id),
      name: route.name,
      lines: route.lines,
      distance: route.distance || total,
      total,
      toXY,
      start: gate(xy[0], unit(p40[0] - xy[0][0], p40[1] - xy[0][1])),         // направление: как едем в начале трассы
      finish: gate(last, unit(last[0] - pEnd40[0], last[1] - pEnd40[1])),     // направление: как приезжаем в конце
      // Все места трассы в пределах maxDist метров от точки P (расстояние и положение s вдоль трассы),
      // а также расстояние до самой близкой точки трассы вообще
      scan(P, maxDist) {
        const hits = [];
        let minDist = Infinity;
        for (let i = 0; i < xy.length - 1; i++) {
          const r = distToSeg(P, xy[i], xy[i + 1]);
          if (r.dist < minDist) minDist = r.dist;
          if (r.dist <= maxDist) hits.push({ dist: r.dist, s: cum[i] + r.t * (cum[i + 1] - cum[i]) });
        }
        return { minDist, hits };
      }
    };
  }

  // Пересёк ли отрезок AB линию ворот g в «нужную» сторону. Возвращает долю пути 0..1 или null.
  function cross(g, A, B) {
    const a = (A[0] - g.c[0]) * g.d[0] + (A[1] - g.c[1]) * g.d[1];
    const b = (B[0] - g.c[0]) * g.d[0] + (B[1] - g.c[1]) * g.d[1];
    if (!(a < 0 && b >= 0)) return null;
    const f = -a / (b - a);
    const X = [A[0] + f * (B[0] - A[0]), A[1] + f * (B[1] - A[1])];
    const lateral = (X[0] - g.c[0]) * g.n[0] + (X[1] - g.c[1]) * g.n[1];
    return Math.abs(lateral) <= C.GATE_HALF_WIDTH_M ? f : null;
  }

  // ---------- Интерфейс (баннер с секундомером) ----------
  function showBanner(title) {
    $('runBanner').classList.add('open');
    $('runBanner').classList.remove('bad');
    $('runName').textContent = title;
    $('runBtn').textContent = 'Отменить заезд';
  }
  function hideBanner() { $('runBanner').classList.remove('open'); }

  function tick() {
    if (!run) return;
    const now = Date.now();
    $('runTime').textContent = U.fmtPrecise((now - run.t0) / 1000);
    if (now - lastPanelT > 250) { lastPanelT = now; STR.ui.render(run.stats); }   // время в нижней панели идёт плавно
    rafId = requestAnimationFrame(tick);
  }
  function stopTick() {
    if (rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    rafId = null;
  }

  function updateInfo() {
    const pct = Math.min(100, Math.round(run.progress / run.pr.total * 100));
    $('runInfo').textContent = run.invalid
      ? `⚠️ Рекорд не засчитается: ${run.reason}\nПройдено ${pct}%`
      : `✅ По трассе · пройдено ${pct}%`;
    $('runBanner').classList.toggle('bad', run.invalid);
  }

  // ---------- Ход заезда ----------
  function startRun(pr, t0, B) {
    // stats — цифры для нижней панели (те же, что при записи маршрута)
    const g = pr.start, Q = pr.toXY(B);
    const along = Math.max(0, (Q[0] - g.c[0]) * g.d[0] + (Q[1] - g.c[1]) * g.d[1]);   // сколько уже отъехали от линии старта
    run = {
      pr, t0, progress: 0, lost: false, invalid: false, reason: '', farSince: null,
      stats: { startT: t0, stopT: null, distance: along, speedNow: filter.speed || 0, maxSpeed: 0, maxGap: 0, points: 0 }
    };
    mode = 'running';
    STR.ui.setRunning(true);                     // кнопка внизу справа становится «отменить заезд»
    showBanner(pr.name);
    $('runTime').textContent = '00:00.00';
    STR.map.showRoute(pr.lines, false);          // трасса сразу появляется на карте
    if (STR.gps.holdScreen) STR.gps.holdScreen();  // экран не гаснет
    U.setStatus(`Заезд «${pr.name}» начался!`);
    updateRun(null, B, false);
    if (run) STR.ui.render(run.stats);
    tick();
  }

  function markInvalid(reason) {
    if (!run.invalid) { run.invalid = true; run.reason = reason; }
  }

  function updateRun(A, B, afterGap) {
    const pr = run.pr, P = pr.toXY(B);
    if (afterGap) markInvalid('потерян GPS-сигнал');

    const { minDist, hits } = pr.scan(P, C.RUN_MAX_DEV_M);

    // 1) Едем по трассе: ищем себя рядом с уже пройденным (так не путаются участки, где дорога повторяется)
    if (!run.lost) {
      let pick = null;
      for (const h of hits) {
        if (h.s >= run.progress - C.RUN_WINDOW_BACK_M && h.s <= run.progress + C.RUN_WINDOW_AHEAD_M &&
            (!pick || h.dist < pick.dist)) pick = h;
      }
      if (pick) run.progress = Math.max(run.progress, pick.s);
      else { run.lost = true; markInvalid('отклонение от трассы больше ' + C.RUN_MAX_DEV_M + ' м'); }
    }

    // 2) Съехали с трассы: пройденное оцениваем по проеханному расстоянию и ждём возвращения на трассу
    if (run.lost) {
      if (A && !afterGap) run.progress = Math.min(pr.total, run.progress + U.haversine(A, B));
      let pick = null;
      for (const h of hits) {
        if (Math.abs(h.s - run.progress) <= C.RUN_RECOVER_TOL_M && (!pick || h.dist < pick.dist)) pick = h;
      }
      if (pick) { run.progress = pick.s; run.lost = false; }
    }

    // Слишком далеко и слишком долго — считаем, что вы уехали с трассы
    if (minDist > C.RUN_ABORT_DEV_M) {
      if (run.farSince === null) run.farSince = B.t;
      else if ((B.t - run.farSince) / 1000 > C.RUN_ABORT_AFTER_S) { abort('Заезд прерван: вы уехали с трассы.'); return; }
    } else {
      run.farSince = null;
    }
    if ((B.t - run.t0) / 1000 > C.RUN_MAX_DURATION_S) { abort('Заезд прерван: прошло слишком много времени.'); return; }

    // Финиш: пересекли линию финиша, пройдя почти всю трассу
    const need = (run.invalid ? C.RUN_FINISH_MIN_PROGRESS_BAD : C.RUN_FINISH_MIN_PROGRESS) * pr.total;
    if (A && !afterGap && run.progress >= need) {
      const fr = cross(pr.finish, pr.toXY(A), P);
      if (fr !== null) { finish(A.t + fr * (B.t - A.t)); return; }
    }

    STR.map.follow(B);
    updateInfo();
  }

  function finish(t1) {
    const pr = run.pr;
    const time = (t1 - run.t0) / 1000;                 // секунды, с долями
    const avg = pr.distance / time * 3.6;
    const prev = STR.api.getRecord(pr.id);

    let info;
    let bad = false;
    let isRecord = false;
    if (run.invalid) {
      bad = true;
      info = `Рекорд не засчитан: ${run.reason}.`;
    } else if (STR.api.submitRecord(pr.id, { time, avgKmh: avg, date: Date.now() })) {
      isRecord = true;
      info = prev ? `🏆 Новый рекорд! Лучше на ${(prev.time - time).toFixed(2)} с` : '🏆 Первый рекорд на этой трассе!';
    } else {
      info = `Рекорд: ${U.fmtPrecise(prev.time)} (вы медленнее на ${(time - prev.time).toFixed(2)} с)`;
    }

    // Нижняя панель показывает итоги заезда: время до сотых берётся из t1, длина — длина трассы
    run.stats.stopT = t1;
    run.stats.distance = pr.distance;
    STR.ui.render(run.stats);

    stopTick();
    run = null;
    mode = 'done';
    STR.ui.setRunning(false);
    cooldownUntil = t1 + C.RUN_COOLDOWN_S * 1000;
    $('runBanner').classList.toggle('bad', bad);
    $('runName').textContent = '🏁 Финиш · ' + pr.name;
    $('runTime').textContent = U.fmtPrecise(time);
    $('runInfo').textContent = `${info}\nСредняя скорость: ${Math.round(avg)} км/ч`;
    $('runBtn').textContent = 'Закрыть';
    if (STR.gps.releaseScreen) STR.gps.releaseScreen();
    U.setStatus(`Финиш! Время: ${U.fmtPrecise(time)}`);
    if (isRecord) STR.api.sendRecord(pr.id, { time, avgKmh: avg });   // общий рекорд на сервер (если подключён)
    if (isRecord && STR.confetti) STR.confetti.fire();   // новый рекорд — конфетти
  }

  function abort(text) {
    cancel();
    U.setStatus(text);
  }

  // Отмена активного заезда (или закрытие окна результата)
  function cancel() {
    stopTick();
    run = null;
    mode = 'idle';
    if (!STR.gps.isRecording()) STR.ui.setRunning(false);
    hideBanner();
    STR.map.clearRoute();
    if (STR.gps.releaseScreen) STR.gps.releaseScreen();
    if (!STR.gps.isRecording()) STR.ui.clearStats();   // цифры заезда убираем из панели
  }

  // ---------- Поток GPS-точек ----------
  // Сюда gps.js присылает каждую новую точку.
  function onFix(p) {
    if (p.acc > C.MAX_ACCURACY_M) return;
    const A = filter.last;
    if (!A) { filter.last = p; return; }
    const dt = (p.t - A.t) / 1000;
    if (dt <= 0) return;

    // Длинная пауза: отрезок через пустоту не используем
    if (dt > C.GAP_BREAK_S) {
      filter.last = p; filter.speed = null;
      if (run) {
        run.stats.maxGap = Math.max(run.stats.maxGap, dt);
        run.stats.speedNow = 0;
        updateRun(null, p, true);
        if (run) STR.ui.render(run.stats);
      }
      return;
    }

    const d = U.haversine(A, p);
    const v = d / dt;
    // Отбрасываем GPS-скачки (слишком быстро / слишком резкое ускорение)
    if (v > C.MAX_SPEED_MS || (filter.speed !== null && Math.abs(v - filter.speed) > C.MAX_ACCEL * dt + 3)) return;
    filter.speed = filter.speed === null ? v : filter.speed * 0.5 + v * 0.5;
    filter.last = p;

    if (run) {
      // Цифры для нижней панели: так же, как при записи маршрута (gps.js)
      const st = run.stats;
      st.maxGap = Math.max(st.maxGap, dt);
      if (v >= C.STANDING_SPEED_MS) st.distance += d;
      let sp = (p.speed != null && p.speed >= 0 && Math.abs(p.speed - v) < 4) ? p.speed : v;
      if (v < C.STANDING_SPEED_MS) sp = 0;
      st.speedNow = st.speedNow * 0.5 + sp * 0.5;
      st.points++;
      if (st.points >= C.MIN_POINTS_FOR_MAX) st.maxSpeed = Math.max(st.maxSpeed, st.speedNow);

      updateRun(A, p, false);
      if (run) {   // заезд мог закончиться или прерваться
        STR.ui.render(run.stats);
        U.setStatus(`Заезд идёт · точность GPS ±${Math.round(p.acc)} м`);
      }
      return;
    }

    // Ищем старт: не во время записи нового маршрута и не сразу после финиша
    if (STR.gps.isRecording() || p.t < cooldownUntil) { pending = null; return; }

    // Линию старта уже пересекли: ждём, пока вы отъедете за неё (защита от «дрожания» GPS на месте)
    if (pending) {
      const g = pending.pr.start, Q = pending.pr.toXY(p);
      const along = (Q[0] - g.c[0]) * g.d[0] + (Q[1] - g.c[1]) * g.d[1];
      if (along >= C.RUN_START_CONFIRM_M) {
        const { pr, t0 } = pending;
        pending = null;
        startRun(pr, t0, p);          // секундомер отсчитывается от момента пересечения линии
        return;
      }
      if (along > -10 && p.t <= pending.until) return;   // ещё ждём
      pending = null;                                     // вернулись назад или слишком долго
    }

    for (const pr of prepared) {
      const fr = cross(pr.start, pr.toXY(A), pr.toXY(p));
      if (fr !== null) { pending = { pr, t0: A.t + fr * (p.t - A.t), until: p.t + C.RUN_START_CONFIRM_S * 1000 }; return; }
    }
  }

  // Перечитать список трасс (после загрузки, сохранения, удаления)
  function refresh() {
    prepared = STR.api.getRoutes().map(prepare).filter(Boolean);
    pending = null;
  }

  // Кнопка в баннере: «Отменить заезд» / «Закрыть»
  $('runBtn').addEventListener('click', cancel);

  return { refresh, onFix, cancel, isActive: () => mode === 'running', isDone: () => mode === 'done' };
})();
