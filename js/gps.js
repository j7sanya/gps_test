// ============================================================
// gps.js — получение геопозиции, фильтрация «шума» и запись трека.
// Если GPS ведёт себя странно (скачки, кривые линии), смотрите сюда
// и в пороги в config.js.
// ============================================================
STR.gps = (function () {
  const C = STR.config, U = STR.u;

  let rec = false;        // идёт ли запись
  let watchId = null;     // номер «слежения» за геопозицией
  let wakeLock = null;    // не даёт экрану погаснуть
  let timerId = null;     // таймер обновления цифр
  let lastPos = null;     // последнее известное положение
  let s = null;           // данные текущей записи

  function reset() {
    s = {
      startT: Date.now(),
      stopT: null,
      last: null,        // последняя принятая точка
      segs: [[]],        // трек делится на части: при потере сигнала начинается новая
      distance: 0,       // метры
      maxSpeed: 0,       // м/с
      maxGap: 0,         // самая длинная пауза между точками, секунды
      speedNow: 0,       // м/с (сглаженная)
      points: 0,
      rejected: 0,
      breaks: 0,         // сколько раз линия разрывалась
      hiddenCount: 0     // сколько раз приложение сворачивали
    };
    STR.map.clearTrack();
  }
  reset();

  // ---------- Пришла новая точка от GPS ----------
  function onPosition(pos) {
    const c = pos.coords;
    const p = { lat: c.latitude, lon: c.longitude, t: pos.timestamp, acc: c.accuracy };

    lastPos = p;
    STR.map.showMe(p);
    if (STR.run) STR.run.onFix(p);   // заезды по трассам (см. run.js)

    // Пока запись не идёт, просто показываем, где мы находимся
    if (!rec) {
      if (!s.stopT) U.setStatus(`Ваше местоположение определено (±${Math.round(p.acc)} м).\nНажмите «Начать запись».`);
      return;
    }

    // 1) Отбрасываем неточные точки
    if (p.acc > C.MAX_ACCURACY_M) { s.rejected++; return; }

    // Первая точка записи
    if (!s.last) {
      s.last = p; s.segs[0].push(p); s.points++;
      STR.map.drawTrack(s.segs);
      return;
    }

    const dt = (p.t - s.last.t) / 1000;
    if (dt <= 0) return;

    // 2) Длинная пауза (свернули приложение, пропал сигнал): начинаем новую часть линии.
    //    Расстояние за время паузы НЕ добавляем и точки не соединяем прямой линией.
    if (dt > C.GAP_BREAK_S) {
      s.maxGap = Math.max(s.maxGap, dt);
      s.breaks++;
      s.segs.push([p]);
      s.last = p;
      s.speedNow = 0;
      s.points++;
      STR.map.drawTrack(s.segs);
      STR.map.follow(p);
      STR.ui.render(s);
      U.setStatus(`Был разрыв записи на ${Math.round(dt)} с, линия начата заново.\nТочек: ${s.points} · разрывов: ${s.breaks}`);
      return;
    }

    const d = U.haversine(s.last, p);
    const v = d / dt;

    // 3) Отбрасываем нереальные скачки: слишком быстро или слишком резкое ускорение
    if (v > C.MAX_SPEED_MS || Math.abs(v - s.speedNow) > C.MAX_ACCEL * dt + 3) {
      s.rejected++;
      return;
    }

    s.maxGap = Math.max(s.maxGap, dt);

    // 4) Расстояние добавляем, только если действительно движемся
    if (v >= C.STANDING_SPEED_MS) s.distance += d;

    // 5) Скорость: берём от GPS, только если она согласуется с нашим расчётом; иначе считаем сами
    let sp = (c.speed != null && c.speed >= 0 && Math.abs(c.speed - v) < 4) ? c.speed : v;
    if (v < C.STANDING_SPEED_MS) sp = 0;
    s.speedNow = s.speedNow * 0.5 + sp * 0.5;   // небольшое сглаживание
    if (s.points >= C.MIN_POINTS_FOR_MAX) s.maxSpeed = Math.max(s.maxSpeed, s.speedNow);

    s.last = p;
    s.segs[s.segs.length - 1].push(p);
    s.points++;
    STR.map.drawTrack(s.segs);
    STR.map.follow(p);
    STR.ui.render(s);
    U.setStatus(`Точек: ${s.points} · точность ±${Math.round(p.acc)} м · отброшено: ${s.rejected}\n` +
                `Сворачивали приложение: ${s.hiddenCount} раз · разрывов: ${s.breaks}`);
  }

  function onError(err) {
    // Если доступ запретили, снимаем слежение, чтобы при старте записи попробовать снова
    if (err.code === 1 && watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    const texts = {
      1: 'Доступ к геолокации запрещён. Разрешите его в настройках Telegram / телефона.',
      2: 'Не удалось определить положение (нет сигнала GPS).',
      3: 'Время ожидания геолокации истекло.'
    };
    U.setStatus(texts[err.code] || ('Ошибка геолокации: ' + err.message));
  }

  // Просим у Telegram доступ к геолокации (новые версии Telegram)
  function askTelegramLocation() {
    return new Promise(resolve => {
      const done = () => resolve();
      try {
        const lm = STR.tg && STR.tg.LocationManager;
        if (!lm) return done();
        setTimeout(done, 15000); // страховка, чтобы не зависнуть
        lm.init(() => {
          if (lm.isLocationAvailable && !lm.isAccessGranted) {
            lm.getLocation(() => done()); // вызывает окно с запросом разрешения
          } else {
            done();
          }
        });
      } catch (e) { done(); }
    });
  }

  // Не даём экрану погаснуть во время записи
  async function keepScreenOn() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
  }

  // Слежение за положением (работает и без записи, чтобы показывать вас на карте)
  async function startWatching() {
    if (watchId !== null) return;
    await askTelegramLocation();
    if (!('geolocation' in navigator)) { U.setStatus('Геолокация недоступна на этом устройстве.'); return; }
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 20000
    });
  }

  // ---------- Старт / стоп записи ----------
  async function start() {
    reset();
    rec = true;
    U.setStatus('Запрашиваю доступ к геолокации…');

    await startWatching();   // если слежение ещё не запущено (например, раньше не дали доступ)

    s.startT = Date.now();
    keepScreenOn();
    timerId = setInterval(() => STR.ui.render(s), 1000);
    U.setStatus(lastPos ? 'Запись идёт…' : 'Ищу GPS-сигнал…');
  }

  // Останавливает запись и возвращает её итоги
  function stop() {
    rec = false;
    s.stopT = Date.now();
    clearInterval(timerId);   // слежение за положением не выключаем: вы остаётесь на карте
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    STR.ui.render(s);
    return {
      segs: s.segs,
      distance: s.distance,                                   // метры
      timeSec: Math.round((s.stopT - s.startT) / 1000),
      points: s.points,
      breaks: s.breaks,
      maxGap: s.maxGap,
      hidden: s.hiddenCount
    };
  }

  // Считаем сворачивания (чтобы понять, как Telegram ведёт себя в фоне)
  document.addEventListener('visibilitychange', () => {
    const running = STR.run && STR.run.isActive();
    if (!rec && !running) return;
    if (document.hidden) { if (rec) s.hiddenCount++; }
    else keepScreenOn();   // экран снова включили — повторно запрашиваем блокировку
  });

  // Для заездов: не давать экрану погаснуть / отпустить
  function releaseScreen() {
    if (!rec && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  return {
    start,
    stop,
    startWatching,
    holdScreen: keepScreenOn,
    releaseScreen,
    isRecording: () => rec,
    lastPos: () => lastPos
  };
})();
