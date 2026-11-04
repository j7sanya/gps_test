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
    try { tg.disableVerticalSwipes(); } catch (e) {}   // чтобы свайп не закрывал приложение
  }

  let session = 0;          // номер записи (чтобы запоздавший ответ от сервера не попал в новую запись)
  let lastRecording = null; // итоги последней записи (для кнопки «Сохранить как трассу»)

  async function onStart() {
    session++;
    lastRecording = null;
    STR.ui.showSave(false);
    STR.ui.setRecording(true);
    await STR.gps.start();
  }

  async function onStop() {
    const mine = session;
    const r = STR.gps.stop();
    STR.ui.setRecording(false, '▶ Начать запись заново');

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

  $('btn').addEventListener('click', () => STR.gps.isRecording() ? onStop() : onStart());
  $('saveBtn').addEventListener('click', () => lastRecording && STR.routes.openSaveDialog(lastRecording));
  $('saveCancel').addEventListener('click', STR.routes.closeSaveDialog);
  $('saveOk').addEventListener('click', STR.routes.save);
  $('routesBtn').addEventListener('click', STR.routes.open);
  $('routesClose').addEventListener('click', STR.routes.close);
  $('locate').addEventListener('click', () => {
    const p = STR.gps.lastPos();
    if (p) STR.map.goTo(p); else STR.gps.startWatching();
  });

  // Запуск: грузим официальные трассы и сразу определяем местоположение
  STR.api.init();
  STR.gps.startWatching();
})();
