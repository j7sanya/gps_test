// ============================================================
// map.js — карта и всё, что на ней рисуется.
// Другие файлы не работают с Leaflet напрямую, а вызывают STR.map.*
// ============================================================
STR.map = (function () {
  const map = L.map('map', { zoomControl: false }).setView([50, 20], 3);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  const me = L.circleMarker([0, 0], { radius: 8, color: '#fff', weight: 3, fillColor: '#19c8ff', fillOpacity: 1 });
  const accCircle = L.circle([0, 0], { radius: 0, weight: 1, color: '#19c8ff', fillOpacity: 0.12 });
  const rawLine = L.polyline([], { weight: 5, color: '#ff2d3d' }).addTo(map);  // «сырой» GPS-трек
  const snapLayer = L.layerGroup().addTo(map);                                   // трек по дорогам
  const routeLayer = L.layerGroup().addTo(map);                                  // выбранная трасса
  let first = true;

  return {
    // Показать «синюю точку» — где я. При первом определении центрируем карту.
    showMe(p) {
      me.setLatLng([p.lat, p.lon]);
      accCircle.setLatLng([p.lat, p.lon]).setRadius(p.acc);
      if (!map.hasLayer(me)) { accCircle.addTo(map); me.addTo(map); }
      if (first) { map.setView([p.lat, p.lon], 16); first = false; }
    },
    follow(p) { map.panTo([p.lat, p.lon], { animate: true }); },
    goTo(p) { map.setView([p.lat, p.lon], Math.max(map.getZoom(), 16)); },

    // Красная линия записываемого трека. Каждая часть (segs) — отдельная линия, без соединений.
    drawTrack(segs) { rawLine.setLatLngs(segs.map(seg => seg.map(p => [p.lat, p.lon]))); },
    clearTrack() {
      rawLine.setLatLngs([]);
      rawLine.setStyle({ opacity: 1, dashArray: null });
      snapLayer.clearLayers();
    },

    // Зелёная линия «по дорогам»; красный трек становится бледным пунктиром
    drawSnapped(geoms) {
      geoms.forEach(g => L.geoJSON({ type: 'LineString', coordinates: g },
        { style: { color: '#22d36b', weight: 6, opacity: 0.95 } }).addTo(snapLayer));
      rawLine.setStyle({ opacity: 0.35, dashArray: '4 8' });
    },

    // Показать трассу (lines — список линий, каждая — список точек [lat, lon]).
    // fit=false: не менять масштаб карты (во время заезда карта следует за вами)
    showRoute(lines, fit = true) {
      routeLayer.clearLayers();
      const all = [];
      lines.forEach(l => {
        L.polyline(l, { color: '#22d36b', weight: 6, opacity: 0.9 }).addTo(routeLayer);
        all.push(...l);
      });
      if (!all.length) return;
      L.circleMarker(all[0], { radius: 5, color: '#0b0d10', weight: 2, fillColor: '#ffffff', fillOpacity: 1 })
        .bindTooltip('Старт').addTo(routeLayer);
      L.circleMarker(all[all.length - 1], { radius: 5, color: '#0b0d10', weight: 2, fillColor: '#ff2d3d', fillOpacity: 1 })
        .bindTooltip('Финиш').addTo(routeLayer);
      if (fit) map.fitBounds(L.latLngBounds(all), { padding: [40, 40] });
    },
    clearRoute() { routeLayer.clearLayers(); }
  };
})();
