// Bertrader: carga los datos, elige la vista por el fragmento de la URL y repinta.
(function () {
  'use strict';
  const R = window.BTRender;
  const view = document.getElementById('view');
  const status = document.getElementById('status');
  const nav = document.getElementById('nav');
  let data = null;
  let rules = null;
  let morning = null;
  let termometro = null;
  let error = null;

  async function load() {
    try {
      const res = await fetch('/bertrader/data.json', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error(res.status === 503 ? 'sin_datos' : 'http_' + res.status);
      data = await res.json();
      error = null;
    } catch (e) {
      error = (e && e.message) || 'red';
    }
  }

  async function loadRules() {
    try {
      const res = await fetch('/bertrader/reglas.md', { cache: 'no-store', credentials: 'same-origin' });
      rules = res.ok ? await res.text() : '';
    } catch (e) {
      rules = '';
    }
  }

  // Sin `manana.json` (o con un fallo) el panel sigue funcionando con lo de siempre.
  async function loadMorning() {
    try {
      const res = await fetch('/bertrader/manana.json', { cache: 'no-store', credentials: 'same-origin' });
      morning = res.ok ? await res.json() : null;
    } catch (e) {
      morning = null;
    }
  }

  // Sin `termometro.json` el bloque dice "sin datos"; el resto del panel no cambia.
  async function loadTermo() {
    try {
      const res = await fetch('/bertrader/termometro.json', { cache: 'no-store', credentials: 'same-origin' });
      termometro = res.ok ? await res.json() : null;
    } catch (e) {
      termometro = null;
    }
  }

  function paint() {
    const now = Date.now();
    nav.innerHTML = R.renderNav(R.route(location.hash).view);
    status.innerHTML = data ? R.renderStatus(data, now) : '';
    view.innerHTML = R.render({ data, error, rules, morning, termometro, hash: location.hash, nowMs: now });
  }

  window.addEventListener('hashchange', () => { paint(); window.scrollTo(0, 0); });
  // Al reabrir la pestaña (o el icono de la pantalla de inicio) se piden datos frescos, sin
  // esperar al siguiente intervalo: los temporizadores se congelan con la página en segundo plano.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') Promise.all([load(), loadMorning(), loadTermo()]).then(paint);
  });
  Promise.all([load(), loadRules(), loadMorning(), loadTermo()]).then(paint);
  // El export corre cada 5 minutos; la antigüedad del dato se refresca cada minuto.
  setInterval(() => Promise.all([load(), loadMorning(), loadTermo()]).then(paint), 5 * 60 * 1000);
  setInterval(() => { if (data) status.innerHTML = R.renderStatus(data, Date.now()); }, 60 * 1000);
})();
