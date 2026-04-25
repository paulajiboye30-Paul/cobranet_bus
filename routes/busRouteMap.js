/**
 * busRouteMap.js
 * Lazy-loaded module for the Daily Bus Route Map Viewer.
 *
 * Exposes: window.BusRouteMap
 *
 * Staff  → openRouteMapModal()  / closeRouteMapModal()
 * Admin  → initAdminRouteMap()  / setDrawMode(mode) / clearAdminMap()
 *          saveAdminRoute()     / loadRouteForEdit(id) / deleteRoute(id)
 *
 * Leaflet + OSM tiles are injected into <head> only once, on first call.
 */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────

  const LAGOS_CENTER  = [6.5244, 3.3792];
  const DEFAULT_ZOOM  = 12;
  const LEAFLET_CSS   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const LEAFLET_JS    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

  // ── Lazy Leaflet loader ────────────────────────────────────────────────

  let _leafletReady = null;

  function loadLeaflet () {
    if (_leafletReady) return _leafletReady;

    _leafletReady = new Promise((resolve, reject) => {
      if (window.L) { resolve(); return; }

      // CSS
      if (!document.querySelector('link[href="' + LEAFLET_CSS + '"]')) {
        const link  = document.createElement('link');
        link.rel    = 'stylesheet';
        link.href   = LEAFLET_CSS;
        document.head.appendChild(link);
      }

      // JS
      const script   = document.createElement('script');
      script.src     = LEAFLET_JS;
      script.onload  = resolve;
      script.onerror = () => reject(new Error('Failed to load Leaflet'));
      document.head.appendChild(script);
    });

    return _leafletReady;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  function getApiBase () {
    // Reuse the same base that script.js sets, or fall back to /api
    return window.API_BASE || '/api';
  }

  function getTodayLagos () {
    return new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
  }

  // ── ─────────────────────────────────────────────────────────────────────
  // STAFF VIEWER
  // ── ─────────────────────────────────────────────────────────────────────

  async function openRouteMapModal () {
    const modal = document.getElementById('route-map-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    const container = document.getElementById('route-map-container');
    container.innerHTML = '<div class="rmap-status">Loading map…</div>';

    // Destroy any previous Leaflet instance on this element
    if (_staffMap) {
      _staffMap.remove();
      _staffMap = null;
    }

    try {
      await loadLeaflet();

      // Fetch today's route
      const resp = await fetch(getApiBase() + '/routes/today');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();

      if (!data.success || !data.route) {
        container.innerHTML =
          '<div class="rmap-status rmap-empty">No bus route has been configured for today.</div>';
        return;
      }

      const route = data.route;

      // Build map div inside container
      container.innerHTML = '<div id="leaflet-staff-map" style="width:100%;height:100%;"></div>';

      // Small delay so the div is in the DOM before Leaflet measures it
      await new Promise(r => setTimeout(r, 80));

      _staffMap = L.map('leaflet-staff-map').setView(LAGOS_CENTER, DEFAULT_ZOOM);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(_staffMap);

      // Route polyline
      if (Array.isArray(route.routeCoordinates) && route.routeCoordinates.length >= 2) {
        const poly = L.polyline(route.routeCoordinates, {
          color:   '#1d6fe8',
          weight:  5,
          opacity: 0.88,
        }).addTo(_staffMap);
        _staffMap.fitBounds(poly.getBounds(), { padding: [40, 40] });
      }

      // Bus-stop markers (yellow circles)
      if (Array.isArray(route.stops)) {
        route.stops.forEach(stop => {
          L.circleMarker([stop.lat, stop.lng], {
            radius:      9,
            fillColor:   '#f5c518',
            color:       '#c8960a',
            weight:      2,
            opacity:     1,
            fillOpacity: 0.95,
          })
            .bindTooltip(stop.name, { permanent: false, direction: 'top', className: 'rmap-tooltip' })
            .addTo(_staffMap);
        });
      }

    } catch (err) {
      console.error('[BusRouteMap] viewer error:', err);
      container.innerHTML =
        '<div class="rmap-status rmap-empty">Failed to load route. Please check your connection and try again.</div>';
    }
  }

  let _staffMap = null;

  function closeRouteMapModal () {
    const modal = document.getElementById('route-map-modal');
    if (modal) modal.classList.add('hidden');
    if (_staffMap) { _staffMap.remove(); _staffMap = null; }
  }

  // ── ─────────────────────────────────────────────────────────────────────
  // ADMIN ROUTE MANAGER
  // ── ─────────────────────────────────────────────────────────────────────

  let _adminMap        = null;
  let _polyline        = null;
  let _routeCoords     = [];
  let _routeStops      = [];
  let _waypointMarkers = [];
  let _stopMarkers     = [];
  let _drawMode        = 'route'; // 'route' | 'stop'
  let _editingId       = null;    // _id of route being edited, or null
  let _allRoutes       = [];

  async function initAdminRouteMap () {
    await loadLeaflet();

    const mapEl = document.getElementById('admin-route-map');
    if (!mapEl) return;

    // Re-initialise on every tab open so the map sizes correctly
    if (_adminMap) { _adminMap.remove(); _adminMap = null; }

    _routeCoords     = [];
    _routeStops      = [];
    _waypointMarkers = [];
    _stopMarkers     = [];
    _polyline        = null;
    _editingId       = null;

    _adminMap = L.map('admin-route-map').setView(LAGOS_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(_adminMap);

    _adminMap.on('click', _onAdminClick);

    // Default the date picker to today
    const datePicker = document.getElementById('route-date-input');
    if (datePicker && !datePicker.value) datePicker.value = getTodayLagos();

    // Reset mode buttons
    setDrawMode('route');

    await _renderRouteList();
  }

  function _onAdminClick (e) {
    const { lat, lng } = e.latlng;

    if (_drawMode === 'route') {
      _routeCoords.push([lat, lng]);

      const m = L.circleMarker([lat, lng], {
        radius: 5, fillColor: '#1d6fe8', color: '#0d4fb3',
        weight: 1, opacity: 1, fillOpacity: 0.85,
      }).addTo(_adminMap);
      m.bindTooltip('Pt ' + _routeCoords.length, { direction: 'top' });
      _waypointMarkers.push(m);

      // Redraw polyline
      if (_polyline) _adminMap.removeLayer(_polyline);
      if (_routeCoords.length >= 2) {
        _polyline = L.polyline(_routeCoords, { color: '#1d6fe8', weight: 5 }).addTo(_adminMap);
      }

    } else if (_drawMode === 'stop') {
      // eslint-disable-next-line no-alert
      const name = prompt('Enter bus stop name:');
      if (!name || !name.trim()) return;

      _routeStops.push({ name: name.trim(), lat, lng });

      const m = L.circleMarker([lat, lng], {
        radius: 9, fillColor: '#f5c518', color: '#c8960a',
        weight: 2, opacity: 1, fillOpacity: 0.95,
      }).addTo(_adminMap);
      m.bindTooltip(name.trim(), { permanent: true, direction: 'top', className: 'rmap-tooltip' });
      _stopMarkers.push(m);
    }
  }

  function setDrawMode (mode) {
    _drawMode = mode;
    const btnRoute = document.getElementById('btn-mode-route');
    const btnStop  = document.getElementById('btn-mode-stop');
    if (btnRoute) btnRoute.classList.toggle('btn-primary',   mode === 'route');
    if (btnRoute) btnRoute.classList.toggle('btn-secondary', mode !== 'route');
    if (btnStop)  btnStop.classList.toggle('btn-primary',    mode === 'stop');
    if (btnStop)  btnStop.classList.toggle('btn-secondary',  mode !== 'stop');
  }

  function clearAdminMap () {
    if (!_adminMap) return;
    _waypointMarkers.forEach(m => _adminMap.removeLayer(m));
    _stopMarkers.forEach(m => _adminMap.removeLayer(m));
    if (_polyline) _adminMap.removeLayer(_polyline);
    _routeCoords     = [];
    _routeStops      = [];
    _waypointMarkers = [];
    _stopMarkers     = [];
    _polyline        = null;
    _editingId       = null;

    const datePicker = document.getElementById('route-date-input');
    if (datePicker) datePicker.value = getTodayLagos();
    setDrawMode('route');
  }

  async function saveAdminRoute () {
    const dateVal = (document.getElementById('route-date-input') || {}).value || '';
    if (!dateVal) { alert('Please select a date for this route.'); return; }
    if (_routeCoords.length < 2) { alert('Please draw at least 2 route points on the map.'); return; }

    const payload = {
      date:             dateVal,
      routeCoordinates: _routeCoords,
      stops:            _routeStops,
    };

    try {
      let resp;
      if (_editingId) {
        resp = await fetch(getApiBase() + '/routes/' + _editingId, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
      } else {
        resp = await fetch(getApiBase() + '/routes', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
      }

      const data = await resp.json();

      if (data.success) {
        alert('Route saved successfully for ' + dateVal + '!');
        if (!_editingId && data.route) _editingId = data.route.id || data.route._id;
        await _renderRouteList();
      } else {
        alert('Failed to save route: ' + (data.message || 'Unknown error.'));
      }
    } catch (err) {
      console.error('[BusRouteMap] save error:', err);
      alert('Network error while saving. Please try again.');
    }
  }

  async function _renderRouteList () {
    const listEl = document.getElementById('admin-route-list');
    if (!listEl) return;

    try {
      const resp = await fetch(getApiBase() + '/routes');
      const data = await resp.json();
      _allRoutes = (data.success && Array.isArray(data.routes)) ? data.routes : [];

      if (!_allRoutes.length) {
        listEl.innerHTML = '<p class="text-muted text-sm" style="padding:.5rem 0;">No routes saved yet.</p>';
        return;
      }

      listEl.innerHTML = _allRoutes.map(r => `
        <div class="rmap-route-row">
          <div class="rmap-route-meta">
            <span class="rmap-route-date">${r.date}</span>
            <span class="rmap-route-info">${r.routeCoordinates.length} waypoints &middot; ${r.stops.length} stops</span>
          </div>
          <div class="rmap-route-actions">
            <button class="btn btn-secondary btn-xs"
              onclick="window.BusRouteMap.loadRouteForEdit('${r._id}')">Edit</button>
            <button class="btn btn-danger btn-xs"
              onclick="window.BusRouteMap.deleteRoute('${r._id}')">Delete</button>
          </div>
        </div>
      `).join('');

    } catch (err) {
      listEl.innerHTML = '<p class="text-muted text-sm" style="padding:.5rem 0;">Error loading route list.</p>';
    }
  }

  function loadRouteForEdit (id) {
    const route = _allRoutes.find(r => r._id === id || r.id === id);
    if (!route) return;

    clearAdminMap();
    _editingId = id;

    const datePicker = document.getElementById('route-date-input');
    if (datePicker) datePicker.value = route.date;

    _routeCoords = (route.routeCoordinates || []).map(pt => [pt[0], pt[1]]);
    _routeStops  = (route.stops || []).map(s => ({ name: s.name, lat: s.lat, lng: s.lng }));

    // Draw loaded route
    if (_routeCoords.length >= 2) {
      _polyline = L.polyline(_routeCoords, { color: '#1d6fe8', weight: 5 }).addTo(_adminMap);
      _adminMap.fitBounds(_polyline.getBounds(), { padding: [40, 40] });
    }

    _routeCoords.forEach((pt, i) => {
      const m = L.circleMarker(pt, {
        radius: 5, fillColor: '#1d6fe8', color: '#0d4fb3',
        weight: 1, opacity: 1, fillOpacity: 0.85,
      }).addTo(_adminMap);
      m.bindTooltip('Pt ' + (i + 1), { direction: 'top' });
      _waypointMarkers.push(m);
    });

    _routeStops.forEach(stop => {
      const m = L.circleMarker([stop.lat, stop.lng], {
        radius: 9, fillColor: '#f5c518', color: '#c8960a',
        weight: 2, opacity: 1, fillOpacity: 0.95,
      }).addTo(_adminMap);
      m.bindTooltip(stop.name, { permanent: true, direction: 'top', className: 'rmap-tooltip' });
      _stopMarkers.push(m);
    });
  }

  async function deleteRoute (id) {
    // eslint-disable-next-line no-alert
    if (!confirm('Delete this route? This cannot be undone.')) return;

    try {
      const resp = await fetch(getApiBase() + '/routes/' + id, { method: 'DELETE' });
      const data = await resp.json();

      if (data.success) {
        if (_editingId === id) clearAdminMap();
        await _renderRouteList();
      } else {
        alert('Failed to delete: ' + (data.message || 'Unknown error.'));
      }
    } catch (err) {
      console.error('[BusRouteMap] delete error:', err);
      alert('Network error while deleting. Please try again.');
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  window.BusRouteMap = {
    // Staff viewer
    openRouteMapModal,
    closeRouteMapModal,
    // Admin manager
    initAdminRouteMap,
    setDrawMode,
    clearAdminMap,
    saveAdminRoute,
    loadRouteForEdit,
    deleteRoute,
  };

}());
