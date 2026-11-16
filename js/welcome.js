// ============================================================
// welcome.js — приветствие из 5 карточек: как ездить, как создать трассу, как работают рекорды,
// что ещё есть в приложении и дисклеймер о безопасности.
//  • Показывается один раз при первом запуске (флаг в localStorage). Пока не нажато
//    «Я понимаю и принимаю» на последней карточке, закрыть его нельзя.
//  • «Пропустить» перелистывает сразу на карточку с дисклеймером — саму её пропустить нельзя.
//  • Открыть снова можно из меню: «Как это работает».
// Хотите, чтобы все игроки увидели обновлённое приветствие ещё раз — смените KEY (…_v2).
// ============================================================
STR.welcome = (function () {
  const $ = STR.u.$;
  const KEY = 'strace_onboard_v1';

  const CARDS = [
    {
      t: 'Выберите трассу и поезжайте',
      x: 'Откройте меню, затем «Трассы» и выберите, где ехать. <b>«Поехать с хода»</b> — таймер включится сам, когда вы проедете старт, и остановится на финише. <b>«Старт с места»</b> — со светофором, как на настоящих соревнованиях.'
    },
    {
      t: 'Создайте свою трассу',
      x: 'Меню → «Трассы» → красная кнопка <b>«+»</b>. Нарисуйте маршрут точками на карте или запишите его заездом. Линия ляжет на дороги. Минимальная длина — 300 м. Трассу можно сделать видимой всем игрокам.'
    },
    {
      t: 'Как работают рекорды',
      x: 'Время считается до сотых. Заезд идёт в зачёт, если вы держитесь в пределах <b>50 м</b> от линии трассы. Рекорды «С хода» и «С места» ведутся отдельно. Все заезды сохраняются в истории с картой скорости.'
    },
    {
      t: 'Ещё полезное',
      x: '<b>Знаки поворотов</b> как в ралли, <b>проекция</b> на лобовое стекло, спидометр на выбор и светофор для старта с места. Ник и аватар меняются в профиле: нажмите на шапку меню.'
    },
    {
      t: 'Безопасность важнее времени',
      x: 'STRace не призывает нарушать правила дорожного движения и категорически не одобряет этого. Нарушение ПДД — это риск для жизни: вашей и других людей. Безопасность на дороге всегда важнее времени и рекордов.' +
        '<ul><li>Всегда соблюдайте ПДД и ограничения скорости. Рекорд не оправдывает нарушение.</li>' +
        '<li>Скоростные заезды — только там, где это разрешено законом, и без риска для других людей. На дорогах общего пользования они недопустимы.</li>' +
        '<li>Не отвлекайтесь на телефон за рулём. Всё настройте до начала движения: знаки и проекция не заменяют внимание на дороге.</li>' +
        '<li>За свои действия за рулём и их последствия вы отвечаете сами.</li></ul>'
    }
  ];
  const LAST = CARDS.length - 1;

  let i = 0, timer = null, firstRun = false;
  const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const isOpen = () => $('welcome').classList.contains('open');

  function stopTimers() { clearInterval(timer); timer = null; }

  function show(n) {
    i = n; stopTimers();
    for (let k = 0; k <= LAST; k++) $('wsc' + k).classList.toggle('on', k === n);
    document.querySelector('.w-card').classList.toggle('last', n === LAST);
    $('wTitle').textContent = CARDS[n].t;
    $('wText').innerHTML = CARDS[n].x;
    $('wText').scrollTop = 0;
    document.querySelectorAll('#wDots i').forEach((d, k) => d.classList.toggle('on', k === n));
    $('wBack').style.visibility = n ? 'visible' : 'hidden';
    $('wSkip').style.visibility = n < LAST ? 'visible' : 'hidden';
    $('wNext').textContent = n === LAST ? 'Я понимаю и принимаю' : 'Далее';
    $('wNext').classList.toggle('warn', n === LAST);
    $('wClose').style.display = firstRun ? 'none' : '';   // при повторном просмотре можно закрыть в любой момент

    if (n === 0) {   // секундомер на первой карточке
      const t0 = Date.now();
      timer = setInterval(() => {
        const v = ((Date.now() - t0) % 5000) / 1000, s = Math.max(0, v - 0.3);
        $('wTm').textContent = '0' + Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') + '.' + String(Math.floor((s % 1) * 100)).padStart(2, '0');
      }, 50);
    }
    if (n === 3) {   // подсветка плиток по очереди
      let h = 0;
      const tiles = document.querySelectorAll('#wsc3 .wtile');
      const step = () => { tiles.forEach((e, k) => e.classList.toggle('hl', k === h % 4)); h++; };
      step(); timer = setInterval(step, 1300);
    }
  }

  function open(again) {
    firstRun = !again;
    $('welcome').classList.add('open');
    show(0);
    try { STR.tg.BackButton.hide(); } catch (e) {}
  }
  function close() {
    stopTimers();
    $('welcome').classList.remove('open');
  }
  function accept() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    close();
  }

  $('wNext').addEventListener('click', () => { if (i < LAST) show(i + 1); else accept(); });
  $('wBack').addEventListener('click', () => { if (i > 0) show(i - 1); });
  $('wSkip').addEventListener('click', () => show(LAST));
  $('wClose').addEventListener('click', () => { if (!firstRun) close(); });

  // Свайп по карточке: влево — дальше, вправо — назад
  let x0 = null;
  const card = $('welcome');
  card.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  card.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (dx < -60 && i < LAST) show(i + 1);
    else if (dx > 60 && i > 0) show(i - 1);
  }, { passive: true });

  // Первый запуск: показываем всем, кто ещё не нажал «Я понимаю»
  if (!seen()) open(false);

  return { open: () => open(true), isOpen, seen };
})();
