// ============================================================
// app.js — «дирижёр»: подключает кнопки и запускает остальные модули.
// Здесь только связки между файлами, никакой сложной логики.
// ============================================================
(function () {
  const U = STR.u, $ = U.$, tg = STR.tg;

  // Сообщаем Telegram, что приложение загрузилось, и раскрываем на весь экран
  if (tg) {
    tg.ready();
    tg.expand();
    // Красим шапку и фон Telegram в цвет приложения (тёмный стиль)
    try { tg.setHeaderColor('#0b0d10'); tg.setBackgroundColor('#0b0d10'); tg.setBottomBarColor('#11141a'); } catch (e) {}
    try { tg.disableVerticalSwipes(); } catch (e) {}   // чтобы свайп не закрывал приложение
  }

  let session = 0;          // номер записи (чтобы запоздавший ответ от сервера не попал в новую запись)
  let lastRecording = null; // итоги последней записи (для кнопки «Сохранить как трассу»)

  async function onStart() {
    STR.run.cancel();   // запись нового маршрута и заезд одновременно не идут
    session++;
    lastRecording = null;
    STR.ui.showSave(false);
    STR.ui.setRecording(true);
    await STR.gps.start();
  }

  async function onStop() {
    const mine = session;
    const r = STR.gps.stop();
    STR.ui.setRecording(false);

    const summary = `Запись завершена.\nТочек: ${r.points} · макс. пауза: ${Math.round(r.maxGap)} с · разрывов: ${r.breaks}\n` +
                    `Сворачивали приложение: ${r.hidden} раз`;
    U.setStatus(summary);
    if (r.points < 2) return;

    // Привязка к дорогам
    U.setStatus(summary + '\nПривязываю маршрут к дорогам…');
    const res = await STR.snap.matchTrack(r.segs);
    if (mine !== session) return;   // за это время начали новую запись

    if (res.matched) {
      STR.map.drawSnapped(res.geoms);
      U.setStatus(summary + `\nПо дорогам (зелёная линия): ${U.fmtKm(res.total)} · участков: ${res.matched}` +
                  (res.failed ? `\nНе удалось привязать частей: ${res.failed}` : ''));
    } else {
      U.setStatus(summary + '\nНе удалось привязать к дорогам (нет сети или рядом нет автодорог). Показан исходный трек.');
    }

    lastRecording = { ...r, geoms: res.geoms, snapTotal: res.total };
    STR.ui.showSave(true);
  }

  // Круглая кнопка: идёт заезд — отмена; идёт запись — стоп; иначе спрашиваем, как создать трассу
  const sheet = $('createSheet');
  const closeSheet = () => sheet.classList.remove('open');
  $('btn').addEventListener('click', () => {
    if (STR.run.isActive()) STR.run.cancel();
    else if (STR.gps.isRecording()) onStop();
    else sheet.classList.add('open');
  });
  $('shDraw').addEventListener('click', () => { closeSheet(); STR.builder.enter(); });
  $('shRecord').addEventListener('click', () => { closeSheet(); onStart(); });
  $('shCancel').addEventListener('click', closeSheet);
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  STR.ui.setFab('start');
  $('saveBtn').addEventListener('click', () => lastRecording && STR.routes.openSaveDialog(lastRecording));
  $('saveCancel').addEventListener('click', STR.routes.closeSaveDialog);
  $('saveOk').addEventListener('click', STR.routes.save);
  $('profileClose').addEventListener('click', STR.profile.close);
  $('routesClose').addEventListener('click', STR.routes.close);
  $('routesNew').addEventListener('click', () => { STR.routes.close(); sheet.classList.add('open'); });   // «+» в списке трасс: нарисовать или записать
  $('locate').addEventListener('click', () => {
    const p = STR.gps.lastPos();
    if (p) STR.map.goTo(p); else STR.gps.startWatching();
  });

  // Ника нет — подсказываем задать его в боте (только если подключён сервер и мы внутри Telegram)
  $('nickLater').addEventListener('click', () => $('nickGate').classList.remove('open'));
  $('nickClose').addEventListener('click', () => { try { tg.close(); } catch (e) { $('nickGate').classList.remove('open'); } });
  STR.api.checkNick().then(r => { if (r === 'none') $('nickGate').classList.add('open'); });

  // Запуск: грузим официальные трассы и сразу определяем местоположение
  STR.api.init().then(() => STR.run.refresh());
  STR.api.loadBoard();   // общие рекорды (нужны и для проверки, умеет ли сервер делить «С хода / С места»)
  STR.api.loadPublicRoutes().then(ok => { if (ok) STR.run.refresh(); });   // публичные трассы других игроков
  STR.gps.startWatching();
})();
