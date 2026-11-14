// ============================================================
// turns.js — поиск поворотов на трассе и их сложность (для знаков как в ралли).
//
// Как это работает:
//  1. Линия трассы пересчитывается в равные шаги по 10 м (убирает шум и неравномерные точки).
//  2. На каждом шаге считаем направление движения по отрезку в 20 м и то, на сколько оно изменилось.
//  3. Подряд идущие шаги, где направление заметно меняется в одну сторону, — один поворот.
//     Смена стороны (S-образный изгиб) начинает новый поворот.
//  4. Сложность зависит от угла поворота (см. LIMITS):
//       1 — лёгкий   15–40°      круг,     зелёный
//       2 — средний  40–75°      квадрат,  жёлтый
//       3 — резкий   75–110°     треугольник, оранжевый
//       4 — очень резкий 110–145° шестиугольник, красный
//       5 — шпилька  больше 145° ромб,     фиолетовый
//
// Поворот: { s0, s1, s, angle, dir, level, radius }
//   s0 / s1 — где поворот начинается и заканчивается (метры от старта трассы), s — его середина,
//   angle — угол в градусах, dir — 'L' влево или 'R' вправо, radius — средний радиус в метрах.
// ============================================================
STR.turns = (function () {
  const STEP = 10;                 // шаг пересчёта линии, м
  const WIN = 2;                   // направление берём по отрезку в WIN шагов (20 м)
  const MIN_RATE = 2;              // с какого изменения направления за шаг (°) считаем, что идёт поворот
  const GAP = 2;                   // сколько «спокойных» шагов подряд терпим внутри одного поворота
  const MIN_ANGLE = 15;            // повороты меньше 15° не показываем
  const LIMITS = [40, 75, 110, 145];   // границы уровней 1–5, градусы

  const wrap = a => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
  const level = angle => { let l = 1; for (const b of LIMITS) if (angle >= b) l++; return l; };

  // xy — точки трассы в метрах [[x, y], ...], cum — накопленная длина до каждой точки
  function detect(xy, cum) {
    const total = cum[cum.length - 1];
    const n = Math.floor(total / STEP) + 1;
    if (n < WIN + 3) return [];

    // 1) пересчёт в равные шаги
    const pts = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
      const s = k * STEP;
      while (j < cum.length - 1 && cum[j] < s) j++;
      const seg = cum[j] - cum[j - 1] || 1;
      const t = Math.max(0, Math.min(1, (s - cum[j - 1]) / seg));
      pts.push([xy[j - 1][0] + t * (xy[j][0] - xy[j - 1][0]), xy[j - 1][1] + t * (xy[j][1] - xy[j - 1][1])]);
    }

    // 2) направление на каждом шаге и его изменение
    const H = [];
    for (let k = 0; k + WIN < n; k++) {
      const dx = pts[k + WIN][0] - pts[k][0], dy = pts[k + WIN][1] - pts[k][1];
      H.push(Math.hypot(dx, dy) < 1 ? (H.length ? H[H.length - 1] : 0) : Math.atan2(dy, dx) * 180 / Math.PI);
    }
    const D = [];   // D[k] — изменение направления между шагами k и k+1 (плюс — влево), происходит около s = (k + 1 + WIN / 2) * STEP
    for (let k = 0; k + 1 < H.length; k++) D.push(wrap(H[k + 1] - H[k]));
    const at = k => (k + 1 + WIN / 2) * STEP;

    // 3) собираем повороты
    const out = [];
    let cur = null;
    const close = () => {
      if (!cur) return;
      const angle = Math.abs(cur.sumActive);
      if (angle >= MIN_ANGLE) {
        const s0 = Math.max(0, at(cur.k0) - STEP / 2), s1 = Math.min(total, at(cur.k1) + STEP / 2);
        let acc = 0, apex = (s0 + s1) / 2;
        for (const [k, d] of cur.steps) { acc += Math.abs(d); if (acc >= angle / 2) { apex = at(k); break; } }
        out.push({
          s0: Math.round(s0), s1: Math.round(s1), s: Math.round(apex),
          angle: Math.round(angle), dir: cur.sign > 0 ? 'L' : 'R', level: level(angle),
          radius: Math.round((s1 - s0) / (angle * Math.PI / 180))
        });
      }
      cur = null;
    };
    for (let k = 0; k < D.length; k++) {
      const d = D[k];
      if (Math.abs(d) >= MIN_RATE) {
        const sign = d > 0 ? 1 : -1;
        if (cur && cur.sign !== sign) close();
        if (!cur) cur = { sign, k0: k, k1: k, sum: 0, sumActive: 0, steps: [], quiet: 0 };
        cur.sum += d; cur.sumActive = cur.sum; cur.k1 = k; cur.quiet = 0; cur.steps.push([k, d]);
      } else if (cur) {
        cur.sum += d; cur.quiet++;
        if (cur.quiet > GAP) close();
      }
    }
    close();
    return out;
  }

  return { detect, level, LIMITS, MIN_ANGLE };
})();
