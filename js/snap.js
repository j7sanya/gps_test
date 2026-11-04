// ============================================================
// snap.js — привязка записанного трека к автодорогам (сервис OSRM).
// Профиль «driving» не использует тротуары и пешеходные дорожки.
// Файл ничего не рисует: он только возвращает результат.
// ============================================================
STR.snap = (function () {
  const C = STR.config, U = STR.u;

  // segs — части трека (списки точек). Возвращает:
  //   geoms  — линии по дорогам (каждая — список [lon, lat])
  //   total  — их общая длина, метры
  //   matched / failed — сколько частей удалось / не удалось привязать
  async function matchTrack(segs) {
    const parts = segs.filter(seg => seg.length >= 2);
    const result = { geoms: [], total: 0, matched: 0, failed: 0, parts: parts.length };

    for (const seg of parts) {
      const pts = U.thin(seg, C.OSRM_MAX_POINTS);
      const coords = pts.map(p => p.lon.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
      const radiuses = pts.map(() => C.SNAP_RADIUS_M).join(';');
      const url = `${C.OSRM_URL}${coords}?overview=full&geometries=geojson&radiuses=${radiuses}&tidy=true`;
      try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.code === 'Ok' && data.matchings && data.matchings.length) {
          for (const m of data.matchings) {
            result.geoms.push(m.geometry.coordinates);
            result.total += m.distance;
            result.matched++;
          }
        } else {
          result.failed++;
        }
      } catch (e) {
        result.failed++;
      }
    }
    return result;
  }

  return { matchTrack };
})();
