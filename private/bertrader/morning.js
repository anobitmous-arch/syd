// Bertrader · vista de mañana: manana.json → HTML. Funciones puras, sin DOM (node --test).
// En el navegador quedan en `window.BTMorning`; render.js las usa.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BTMorning = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA = 1;
  const STALE_MS = 45 * 60 * 1000;
  const FUTURE_MS = 60 * 1000;   // reloj adelantado tolerado; más allá, el dato no es de fiar
  const STATE_ES = { encima: 'por encima de la banda', dentro: 'dentro de la banda', debajo: 'por debajo de la banda' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function num(n, digits) {
    return n == null ? '—' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
  }
  function price(n) {
    if (n == null) return '—';
    const d = n >= 1000 ? 0 : n >= 1 ? 2 : 4;
    return num(n, d);
  }
  function pct(n) {
    if (n == null) return '—';
    const s = Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n > 0 ? '+' : n < 0 ? '−' : '') + s + ' %';
  }
  function tone(n) { return n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : ''; }
  function shortDay(day) {
    return new Date(day + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
  }
  function time(iso, tz) {
    if (!iso) return '';
    const opts = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
    try {
      return new Date(iso).toLocaleString('es-ES', { ...opts, timeZone: tz || 'UTC' });
    } catch (e) {
      return new Date(iso).toLocaleString('es-ES', { ...opts, timeZone: 'UTC' });
    }
  }

  // Válido = esquema y tipo conocidos; fresco = válido y de menos de 45 min (sin venir del futuro).
  function isValid(m) {
    return !!m && m.schema === SCHEMA && m.kind === 'manana';
  }

  function isFresh(m, nowMs) {
    const age = isValid(m) ? nowMs - Date.parse(m.generated_at) : NaN;
    return age < STALE_MS && age > -FUTURE_MS;
  }

  function radarHtml(m, tz) {
    const r = m && m.radar;
    if (!r) return '<section><h2>Radar de BTC</h2><p class="empty">Radar sin datos ahora mismo.</p></section>';
    const w = r.weekly || {};
    const st = r.structure || {};
    const pivot = (p, kind) => p ? `Último ${kind} ${p.rising == null ? '' : p.rising ? 'creciente' : 'decreciente'}: <b>${price(p.price)}</b> <span class="muted">(${esc(shortDay(p.date))})</span>` : '';
    const levels = (r.levels || []).map((l) => `<li><b>${esc(l.label)}</b> ${price(l.price)} · ` +
      `<span class="${tone(l.distance_pct)}">${pct(l.distance_pct)}</span>` +
      (l.last_alert_at ? ` <span class="muted">· último aviso ${esc(time(l.last_alert_at, tz))} a ${price(l.last_alert_px)}</span>` : '') +
      '</li>').join('');
    return '<section><h2>Radar de BTC</h2>' +
      `<p class="radar-price"><b>${price(r.price)}</b> <span class="${tone(r.change_24h)}">${pct(r.change_24h)} 24 h</span></p>` +
      `<p>BMSB semanal ${price(w.bmsb_low)}–${price(w.bmsb_high)}: ${esc(STATE_ES[w.state] || 'sin datos')} ` +
      `(<span class="${tone(w.vs_bmsb_pct)}">${pct(w.vs_bmsb_pct)}</span>) · EMA50 semanal ${price(w.ema50)} ` +
      `(<span class="${tone(w.vs_ema50_pct)}">${pct(w.vs_ema50_pct)}</span>)</p>` +
      `<p class="structure">${[pivot(st.last_high, 'máximo'), pivot(st.last_low, 'mínimo')].filter(Boolean).join('<br>') || 'Estructura semanal sin datos.'}</p>` +
      `<h3>Niveles de tu plan</h3><ul class="levels-list">${levels}</ul></section>`;
  }

  function marketRow(a) {
    const mark = a.near_signal ? ` <span class="pill pill-near">a una condición de ${esc(a.near_signal)}</span>` : '';
    const body = a.error
      ? '<span class="muted">sin datos de mercado</span>'
      : `<span class="asset-price">${price(a.price)}</span><span><span class="${tone(a.change_24h)}">${pct(a.change_24h)}</span>` +
        ` <span class="muted">· 7 d</span> <span class="${tone(a.change_7d)}">${pct(a.change_7d)}</span></span>`;
    return `<a class="asset" href="#/activo/${encodeURIComponent(a.coin)}"><span class="asset-coin">${esc(a.coin)}</span>` +
      `<span class="muted">${esc(a.name)}</span>${body}${mark}</a>`;
  }

  function marketHtml(m) {
    const assets = (m && m.assets) || [];
    const lane = assets.filter((a) => a.group === 'carril');
    const radar = assets.filter((a) => a.group === 'radar');
    return '<section><h2>Activos</h2>' +
      (lane.length ? `<div class="assets">${lane.map(marketRow).join('')}</div>` : '<p class="empty">Sin activos del carril.</p>') +
      (radar.length ? `<h3>Altcoins vigiladas</h3><div class="assets">${radar.map(marketRow).join('')}</div>` : '') +
      '</section>';
  }

  // El enlace viene de un feed ajeno: solo http(s), nunca `javascript:` ni similares.
  function newsItem(a, tz) {
    const title = /^https?:\/\//i.test(String(a.url || ''))
      ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a>`
      : esc(a.title);
    return `<li>${title}` +
      ` <span class="muted">${esc(a.source)}${a.published_at ? ' · ' + esc(time(a.published_at, tz)) : ''}</span></li>`;
  }

  function newsHtml(m, tz, today) {
    const n = m && m.news;
    if (!n || !n.top || !n.top.length) return '';
    const old = today && n.day && n.day !== today ? ` <span class="muted">(del ${esc(shortDay(n.day))})</span>` : '';
    return `<section><h2>Noticias${old}</h2><ul class="news">${n.top.map((a) => newsItem(a, tz)).join('')}</ul></section>`;
  }

  function chartSvg(candles, ema) {
    if (!candles || !candles.length) return '';
    const W = 300, H = 140, pad = 4;
    const emaVals = (ema || []).filter((v) => v != null);
    const lo = Math.min(...candles.map((c) => c[3]), ...emaVals);
    const hi = Math.max(...candles.map((c) => c[2]), ...emaVals);
    const span = hi - lo || 1;
    const step = (W - 2 * pad) / candles.length;
    const y = (v) => (pad + (hi - v) / span * (H - 2 * pad)).toFixed(1);
    const bodies = candles.map((c, i) => {
      const x = pad + i * step + step / 2;
      const top = y(Math.max(c[1], c[4])), bottom = y(Math.min(c[1], c[4]));
      return `<g class="c ${c[4] >= c[1] ? 'up' : 'down'}"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y(c[2])}" y2="${y(c[3])}"/>` +
        `<rect x="${(x - step * 0.35).toFixed(1)}" y="${top}" width="${(step * 0.7).toFixed(1)}" height="${Math.max(0.5, bottom - top).toFixed(1)}"/></g>`;
    }).join('');
    const pts = (ema || []).map((v, i) => (v == null ? null : `${(pad + i * step + step / 2).toFixed(1)},${y(v)}`)).filter(Boolean).join(' ');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Velas diarias de 90 días con la EMA50">` +
      `${bodies}${pts ? `<polyline class="ema" points="${pts}"/>` : ''}</svg>`;
  }

  function indicatorsHtml(i) {
    const row = (label, value) => `<li><span class="muted">${label}</span> <b>${value}</b></li>`;
    return '<ul class="indicators">' +
      row('Precio vs EMA50', `${price(i.ema50)} · <span class="${tone(i.vs_ema50_pct)}">${pct(i.vs_ema50_pct)}</span>`) +
      row('Precio vs EMA200', i.ema200 == null ? 'sin historial suficiente' : `${price(i.ema200)} · <span class="${tone(i.vs_ema200_pct)}">${pct(i.vs_ema200_pct)}</span>`) +
      row('RSI 14', num(i.rsi14, 1)) +
      row('Estocástico 14/3/3', num(i.stoch_k, 1)) +
      row('ATR 14', `${num(i.atr_pct, 2)} % · stop largo ${price(i.stop_long)} · stop corto ${price(i.stop_short)}`) +
      row('Volumen / media 20', i.vol_ratio == null ? '—' : `${num(i.vol_ratio, 2)}×`) + '</ul>';
  }

  function jaimeHtml(j) {
    const side = (key, label) => {
      const s = j[key];
      if (!s || !s.conditions || !s.conditions.length) return '';
      return `<h4>${s.count} de 4 para ${label}</h4><ul class="checks">` +
        s.conditions.map((c) => `<li>${c.ok ? '✅' : '⬜'} ${esc(c.label)}</li>`).join('') + '</ul>';
    };
    return `<h3>JaimeStratX en diario</h3><p class="muted">Última vela cerrada. Con 4 de 4, el bot propone.</p>${side('long', 'largo')}${side('short', 'corto')}`;
  }

  function assetMorningHtml(m, coin, tz) {
    const a = m && (m.assets || []).find((x) => x.coin === coin);
    if (!a || a.error || !a.candles || !a.candles.length || !a.indicators) {
      return '<p class="empty">Sin datos de mercado para este activo ahora mismo.</p>';
    }
    const news = '<h3>Noticias de los últimos 7 días</h3>' + (a.news && a.news.length
      ? `<ul class="news">${a.news.map((n) => newsItem(n, tz)).join('')}</ul>`
      : '<p class="empty">Ninguna noticia lo nombra.</p>');
    return `<p class="asset-head"><b>${price(a.price)}</b> <span class="${tone(a.change_24h)}">${pct(a.change_24h)} 24 h</span>` +
      ` · 7 d <span class="${tone(a.change_7d)}">${pct(a.change_7d)}</span></p>` +
      `${chartSvg(a.candles, a.ema50)}<h3>Indicadores en diario</h3>${indicatorsHtml(a.indicators)}` +
      `${a.jaime ? jaimeHtml(a.jaime) : ''}${news}`;
  }

  return { isValid, isFresh, radarHtml, marketHtml, newsHtml, newsItem, chartSvg, assetMorningHtml, price, pct, tone, esc };
});
