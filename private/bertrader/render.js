// Bertrader: datos → HTML. Funciones puras, sin DOM, para poder probarlas con `node --test`.
// En el navegador quedan en `window.BTRender`.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./morning.js'));
  else root.BTRender = factory(root.BTMorning);
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  const SCHEMA = 1;
  const STALE_MS = 15 * 60 * 1000;
  const CLASS_ES = { crypto: 'cripto', index: 'índices', commodity: 'materias primas', equity: 'acciones', other: 'otra' };
  const OUTCOME_ES = {
    seguida: 'Seguida', descartada: 'Descartada', sin_decidir: 'Sin decidir', bloqueada: 'Bloqueada',
    pendiente: 'Pendiente', no_ejecutada: 'Aprobada, no ejecutada',
  };
  const STATE_ES = { posicion: 'Posición abierta', propuesta: 'Propuesta pendiente', sin_senal: 'Sin señal' };
  const KIND_ES = { estudio: 'Estudio', investigacion: 'Investigación', trading: 'Trading' };
  const EVENT_ES = { foreign_fill: 'Orden ajena', emergency_stop: 'Stop de emergencia' };
  const VIEWS = [['panel', '#/', 'Panel'], ['diario', '#/diario', 'Diario'], ['conducta', '#/conducta', 'Conducta'], ['reglas', '#/reglas', 'Reglas']];
  // Motivo de una propuesta sin decidir, tal como lo guarda BBots → frase legible.
  const EXPIRED_ES = { tiempo: 'Caducó por tiempo', precio: 'Caducó: el precio se alejó de la entrada' };
  const ERRORS = {
    cargando: 'Cargando…',
    sin_datos: 'Todavía no hay datos: el export aún no ha corrido.',
    http_404: 'Sesión caducada. Abre de nuevo el enlace con clave.',
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function price(n) {
    return n == null ? '—' : Number(n).toLocaleString('es-ES', { maximumSignificantDigits: 6 });
  }

  function usd(n) {
    if (n == null) return '—';
    return Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  function money(n) {
    if (n == null) return '—';
    return (n > 0 ? '+' : n < 0 ? '−' : '') + usd(n);
  }

  function tone(n) {
    return n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  }

  function format(date, options, tz) {
    if (isNaN(date)) return '';
    try {
      return new Intl.DateTimeFormat('es-ES', { ...options, timeZone: tz }).format(date);
    } catch (e) {
      return new Intl.DateTimeFormat('es-ES', { ...options, timeZone: 'UTC' }).format(date);
    }
  }

  function when(iso, tz) {
    return format(new Date(iso), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, tz);
  }

  function dayLabel(day) {
    return format(new Date(day + 'T00:00:00Z'), { weekday: 'long', day: 'numeric', month: 'long' }, 'UTC') || String(day);
  }

  function route(hash) {
    const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'activo' && parts[1]) {
      try {
        return { view: 'activo', coin: decodeURIComponent(parts[1]) };
      } catch (e) {
        return { view: 'panel' };   // fragmento mal formado
      }
    }
    if (['diario', 'conducta', 'reglas'].includes(parts[0])) return { view: parts[0] };
    return { view: 'panel' };
  }

  function freshness(generatedAt, nowMs) {
    const age = nowMs - Date.parse(generatedAt);
    if (isNaN(age)) return { text: 'sin hora de actualización', stale: true };
    const min = Math.max(0, Math.round(age / 60000));
    const text = min < 1 ? 'actualizado ahora'
      : min < 60 ? `actualizado hace ${min} min`
      : `actualizado hace ${Math.floor(min / 60)} h ${min % 60} min`;
    return { text, stale: age > STALE_MS };
  }

  function remaining(expiresAt, nowMs) {
    const ms = Date.parse(expiresAt) - nowMs;
    if (!(ms > 0)) return 'caducando';
    const min = Math.ceil(ms / 60000);
    return min >= 60 ? `caduca en ${Math.floor(min / 60)} h ${min % 60} min` : `caduca en ${min} min`;
  }

  function renderStatus(data, nowMs) {
    const live = data.execution === 'live';
    const fresh = freshness(data.generated_at, nowMs);
    return `<span class="tag ${live ? 'tag-real' : 'tag-papel'}">${live ? 'REAL' : 'PAPEL'}</span>` +
      `<span class="fresh${fresh.stale ? ' stale' : ''}">${esc(fresh.text)}${fresh.stale ? ' · datos sin refrescar' : ''}</span>`;
  }

  function renderNav(view) {
    return VIEWS.map(([id, href, label]) => `<a href="${href}"${id === view ? ' class="on"' : ''}>${label}</a>`).join('');
  }

  function coinLink(coin) {
    return `<a class="coin" href="#/activo/${encodeURIComponent(coin)}">${esc(coin)}</a>`;
  }

  function tags(e) {
    return (e.demo ? '<span class="tag tag-demo">prueba</span>' : '') +
      (e.mode ? `<span class="tag tag-${esc(e.mode)}">${esc(e.mode)}</span>` : '');
  }

  function levels(e) {
    return '<div class="levels">' +
      `<span>Entrada <b>${price(e.entry)}</b></span><span>Stop <b>${price(e.stop)}</b></span>` +
      `<span>Objetivo <b>${price(e.target)}</b></span><span>Riesgo <b>${usd(e.risk_usd)}</b></span></div>`;
  }

  function entryHtml(e, tz, extra) {
    const time = `<time>${esc(when(e.at, tz))}</time>`;
    if (e.type === 'session') {
      return '<article class="entry entry-session">' +
        `<div class="entry-head"><span class="what">Sesión · ${esc(KIND_ES[e.kind] || e.kind)}</span>${time}</div>` +
        `<p class="note">${esc(e.note)}</p></article>`;
    }
    if (e.type !== 'proposal') {
      const what = e.type === 'manual_close' ? 'Cierre manual' : EVENT_ES[e.kind] || e.kind;
      return `<article class="entry entry-${e.type === 'manual_close' ? 'manual' : 'event'}">` +
        `<div class="entry-head"><span class="what">${esc(what)}</span>${coinLink(e.coin)}${tags(e)}${time}</div>` +
        `<p class="note">${esc(e.note)}</p></article>`;
    }
    let result = '';
    if (e.result != null) result = `<p class="result ${tone(e.result)}">Resultado: ${money(e.result)}</p>`;
    else if (e.would_have != null) result = `<p class="result would">Habría dado: ${money(e.would_have)}</p>`;
    return `<article class="entry entry-${esc(e.outcome)}">` +
      `<div class="entry-head">${coinLink(e.coin)}` +
      `<span class="side side-${esc(e.side)}">${e.side === 'long' ? 'LONG' : 'SHORT'}</span>` +
      `<span class="muted">${esc(e.timeframe)}</span>` +
      `<span class="tag tag-outcome">${esc(OUTCOME_ES[e.outcome] || e.outcome)}</span>${tags(e)}${time}</div>` +
      levels(e) +
      (e.note ? `<p class="note">${esc(e.note)}</p>` : '') +
      (e.detail && e.outcome !== 'seguida'
        ? `<p class="detail">${esc((e.outcome === 'sin_decidir' && EXPIRED_ES[e.detail]) || e.detail)}</p>` : '') +
      result + (extra || '') + '</article>';
  }

  function assetMeta(a) {
    return `${esc(CLASS_ES[a.asset_class] || a.asset_class)} · ${esc(a.timeframes.join(', '))}`;
  }

  function pill(state) {
    return `<span class="pill pill-${esc(state)}">${esc(STATE_ES[state] || state)}</span>`;
  }

  function assetCard(a, tz) {
    return `<a class="asset" href="#/activo/${encodeURIComponent(a.coin)}">` +
      `<span class="asset-coin">${esc(a.coin)}</span><span class="muted">${assetMeta(a)}</span>` +
      `<span class="asset-price">${price(a.price)}</span>` +
      `<span class="muted">${a.price_at ? esc(when(a.price_at, tz)) : ''}</span>${pill(a.state)}</a>`;
  }

  function guarded(fn, fallback) {
    try {
      return fn();
    } catch (e) {
      return fallback();
    }
  }

  // Orden del panel: lo de hoy, radar de BTC, activos, noticias y trades. Sin `manana.json`
  // fresco se avisa arriba del radar y los activos vuelven a las tarjetas del catálogo.
  function panelHtml(data, nowMs, morning) {
    const p = data.panel;
    const tz = data.tz;
    // De un esquema desconocido no se usa nada; viejo pero válido, el radar se ve bajo el aviso.
    // Cada sección de mañana va aislada: si su forma es rara, cae a su texto de respaldo.
    const valid = M.isValid(morning) ? morning : null;
    const fresh = M.isFresh(morning, nowMs);
    const cards = () => '<section><h2>Activos</h2>' + (p.assets.length
      ? `<div class="assets">${p.assets.map((a) => assetCard(a, tz)).join('')}</div>` +
        '<p class="hint">Precio del catálogo: se refresca cada hora.</p>'
      : '<p class="empty">No hay activos seguidos.</p>') + '</section>';
    const assets = fresh ? guarded(() => M.marketHtml(morning), cards) : cards();
    const radar = guarded(() => M.radarHtml(valid, tz, nowMs), () => M.radarHtml(null, tz));
    const news = guarded(() => M.newsHtml(valid, tz, data.today), () => '');
    const session = p.session_done
      ? '<p class="session done">Sesión de hoy: hecha</p>'
      : '<p class="session todo">Sesión de hoy: pendiente · apúntala con /sesion en Telegram</p>';
    const alerts = (p.pause_until
      ? `<p class="alert">Pausa por 3 pérdidas seguidas: sin entradas hasta el ${esc(dayLabel(p.pause_until))} incluido.</p>` : '') +
      (p.review_due
        ? `<p class="alert">Hoy toca revisión escrita: ${esc(p.review_due.coin)} cerró ayer con ${money(p.review_due.net)}.</p>` : '');
    const classes = Object.keys(p.by_class)
      .map((c) => `${esc(CLASS_ES[c] || c)} ${p.by_class[c]}/${p.limits.max_per_class}`).join(' · ');
    const positions = p.positions.length
      ? p.positions.map((e) => entryHtml(e, tz)).join('')
      : '<p class="empty">Sin posiciones abiertas.</p>';
    const pending = p.pending.length
      ? p.pending.map((e) => entryHtml(e, tz,
        `<p class="expires">${esc(remaining(e.expires_at, nowMs))} · se decide en Telegram</p>`)).join('')
      : '<p class="empty">Nada que decidir ahora.</p>';
    const stale = fresh ? '' : '<p class="alert">Datos de mercado sin refrescar.</p>';
    return `<section><h2>Hoy</h2>${session}${alerts}` +
      `<h3>Propuestas pendientes</h3>${pending}` +
      `<h3>Posiciones abiertas</h3>${positions}</section>` +
      stale + radar + assets + news +
      `<section><h2>Trades</h2>` +
      `<p class="capital">Capital <b>${usd(p.capital.current)}</b> <span class="muted">· suelo ${usd(p.capital.floor)}` +
      ` · resultado cerrado ${money(p.capital.realized)}</span></p>` +
      `<p class="counts">Posiciones abiertas <b>${p.positions.length}/${p.limits.max_positions}</b>` +
      `${classes ? ' · ' + classes : ''}</p></section>`;
  }

  function assetHtml(data, coin, morning, nowMs) {
    const asset = data.panel.assets.find((a) => a.coin === coin);
    const history = data.journal.filter((e) => e.coin === coin);
    const vigilada = M.isValid(morning) && ((morning.assets || []).find((a) => a && a.coin === coin) || {}).group === 'radar';
    const head = asset
      ? `<p class="asset-head">${pill(asset.state)} <b>${price(asset.price)}</b> <span class="muted">${assetMeta(asset)}</span></p>`
      : vigilada ? '<p class="empty">Altcoin vigilada (fuera del carril)</p>'
        : '<p class="empty">Este activo no está entre los seguidos.</p>';
    const list = history.length
      ? history.map((e) => entryHtml(e, data.tz)).join('')
      : '<p class="empty">Sin historial todavía.</p>';
    const valid = M.isValid(morning) ? morning : null;
    const block = guarded(() => M.assetMorningHtml(valid, coin, data.tz, nowMs), () => M.assetMorningHtml(null, coin, data.tz));
    return `<section><h2>${esc(coin)}</h2>${head}${block}<h3>Historial</h3>${list}</section>`;
  }

  function diarioHtml(data) {
    if (!data.journal.length) return '<section><h2>Diario</h2><p class="empty">El diario está vacío.</p></section>';
    const out = [];
    let day = null;
    for (const e of data.journal) {
      if (e.day !== day) {
        day = e.day;
        out.push(`<h3 class="day-title">${esc(dayLabel(day))}</h3>`);
      }
      out.push(entryHtml(e, data.tz));
    }
    return `<section><h2>Diario</h2>${out.join('')}</section>`;
  }

  function stat(label, value, hint) {
    return `<div class="stat"><span class="stat-value">${esc(value)}</span><span class="stat-label">${esc(label)}</span>` +
      `${hint ? `<span class="stat-hint">${esc(hint)}</span>` : ''}</div>`;
  }

  function conductaHtml(data) {
    const c = data.conduct;
    const weeks = c.weeks.map((w) => '<div class="week">' +
      w.days.map((d) => `<span class="day day-${esc(d.state)}" title="${esc(d.day)}"></span>`).join('') +
      `<span class="week-mark">${w.ok == null ? '' : w.ok ? '✓' : '✗'}</span></div>`).join('');
    const gaps = c.disconnections.length
      ? `<ul class="gaps">${c.disconnections.map((g) => `<li>${esc(dayLabel(g.from))} → ${esc(dayLabel(g.to))} · ` +
        `${g.days} días${g.after_loss ? ' · tras pérdida' : ''}</li>`).join('')}</ul>`
      : '';
    const cf = c.counterfactual;
    const row = (label, t, colored) => `<tr><td>${label}</td><td>${t.n}</td>` +
      `<td class="${colored ? tone(t.net) : ''}">${t.n ? money(t.net) : '—'}</td></tr>`;
    return '<section><h2>Conducta</h2><div class="stats">' +
      stat('Días con sesión', `${c.days_with_session} de ${c.days_elapsed}`) +
      stat('Desconexiones', c.disconnections.length, 'objetivo: 0') +
      stat('Fuera de reglas', c.out_of_rules,
        data.execution === 'paper' ? 'la detección se activa con el paso a real' : 'objetivo: 0') +
      '</div><h3>Ocho semanas</h3><div class="weeks"><div class="week week-head">' +
      ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span>${d}</span>`).join('') + '<span></span></div>' +
      `${weeks}</div>` +
      '<p class="hint">Un día sin sesión por semana no cuenta como fallo. Desconexión: dos o más días seguidos sin sesión.</p>' +
      gaps +
      `<h3>Propuestas</h3><p class="counts">Seguidas <b>${c.proposals.seguidas}</b> · Descartadas <b>${c.proposals.descartadas}</b>` +
      ` · Sin decidir <b>${c.proposals.sin_decidir}</b> · Bloqueadas <b>${c.proposals.bloqueadas}</b></p>` +
      '<h3>Qué habría pasado</h3><table class="cf"><thead><tr><th></th><th>Cerradas</th><th>Neto</th></tr></thead><tbody>' +
      row('Seguidas', cf.seguidas, true) + row('Descartadas', cf.descartadas, false) + row('Sin decidir', cf.sin_decidir, false) +
      '</tbody></table>' +
      '<p class="hint">Solo cuentan operaciones ya cerradas. Descartadas y sin decidir, con el modelo de costes del laboratorio.</p></section>';
  }

  function inline(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  }

  // Markdown mínimo, lo justo para `reglas.md`: títulos, lista numerada (conserva el número
  // aunque haya viñetas en medio), viñetas, negrita y código.
  function reglasHtml(md) {
    if (!md) return '<section><h2>Reglas</h2><p class="empty">No se han podido cargar las reglas.</p></section>';
    const out = [];
    let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    const open = (kind) => { if (list !== kind) { close(); out.push(`<${kind}>`); list = kind; } };
    for (const raw of String(md).split('\n')) {
      const line = raw.trimEnd();
      let m;
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
        close();
        const level = m[1].length + 1;
        out.push(`<h${level}>${inline(m[2])}</h${level}>`);
      } else if ((m = line.match(/^(\d+)\.\s+(.*)$/))) {
        open('ol');
        out.push(`<li value="${m[1]}">${inline(m[2])}</li>`);
      } else if ((m = line.match(/^\s*-\s+(.*)$/))) {
        open('ul');
        out.push(`<li>${inline(m[1])}</li>`);
      } else if (line.trim()) {
        close();
        out.push(`<p>${inline(line.trim())}</p>`);
      }
    }
    close();
    return `<section class="rules">${out.join('')}</section>`;
  }

  function errorText(code) {
    return ERRORS[code] || `No se han podido cargar los datos (${code}).`;
  }

  // Unos datos con una forma inesperada no pueden dejar la página muda en "Cargando…".
  function render(args) {
    try {
      return draw(args);
    } catch (e) {
      return `<p class="empty">No se han podido pintar los datos (${esc(e && e.message)}). Recarga la página.</p>`;
    }
  }

  function draw({ data, error, rules, morning, hash, nowMs }) {
    if (!data) return `<p class="empty">${esc(errorText(error || 'cargando'))}</p>`;
    if (data.schema !== SCHEMA) {
      return '<p class="empty">El fichero trae una versión de datos que esta página no conoce. Recarga la página.</p>';
    }
    const banner = error ? `<p class="alert">${esc(errorText(error))}</p>` : '';
    const r = route(hash);
    if (r.view === 'activo') return banner + assetHtml(data, r.coin, morning, nowMs);
    if (r.view === 'diario') return banner + diarioHtml(data);
    if (r.view === 'conducta') return banner + conductaHtml(data);
    if (r.view === 'reglas') return banner + reglasHtml(rules);
    return banner + panelHtml(data, nowMs, morning);
  }

  return { esc, route, freshness, renderStatus, renderNav, render };
});
