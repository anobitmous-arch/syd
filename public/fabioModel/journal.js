// Diario en papel: lógica pura (sin DOM) para probarla en Node.
// La salida se resuelve con velas de 1m desde el minuto SIGUIENTE a la entrada (la vela de la
// entrada tiene precios de antes de entrar). Si una vela toca stop y objetivo, cuenta el stop.

export function resolveExit(t, bars) {
  const long = t.side === 'L';
  const firstMin = Math.floor(t.entryT / 60) * 60 + 60;
  for (const b of bars) {
    if (b.t < firstMin) continue;
    if (long) {
      if (b.o <= t.stop) return { exitT: b.t, exitPx: b.o, exitReason: 'SL' };
      if (b.l <= t.stop) return { exitT: b.t, exitPx: t.stop, exitReason: 'SL' };
      if (b.o >= t.tp) return { exitT: b.t, exitPx: b.o, exitReason: 'TP' };
      if (b.h >= t.tp) return { exitT: b.t, exitPx: t.tp, exitReason: 'TP' };
    } else {
      if (b.o >= t.stop) return { exitT: b.t, exitPx: b.o, exitReason: 'SL' };
      if (b.h >= t.stop) return { exitT: b.t, exitPx: t.stop, exitReason: 'SL' };
      if (b.o <= t.tp) return { exitT: b.t, exitPx: b.o, exitReason: 'TP' };
      if (b.l <= t.tp) return { exitT: b.t, exitPx: t.tp, exitReason: 'TP' };
    }
  }
  return null;
}

// Con la página abierta: cada trade de Hyperliquid se mira contra stop y objetivo.
export function liveExit(t, px, at) {
  const long = t.side === 'L';
  if (long ? px <= t.stop : px >= t.stop) return { exitT: at, exitPx: t.stop, exitReason: 'SL' };
  if (long ? px >= t.tp : px <= t.tp) return { exitT: at, exitPx: t.tp, exitReason: 'TP' };
  return null;
}

// Mismo cálculo que el servidor (comisión por lado incluida).
export function rAt(t, px) {
  const dir = t.side === 'L' ? 1 : -1;
  const risk = Math.abs(t.entry - t.stop);
  return dir * (px - t.entry) / risk - (2 * t.costBps / 1e4) * t.entry / risk;
}

export function summary(trades) {
  const closed = trades.filter((t) => t.exitT);
  const total = closed.reduce((s, t) => s + t.r, 0);
  const wins = closed.filter((t) => t.r > 0).length;
  const reviewed = closed.filter((t) => t.followed !== null);
  return {
    n: closed.length, open: trades.length - closed.length, total,
    win: closed.length ? wins / closed.length : null,
    avg: closed.length ? total / closed.length : null,
    followed: reviewed.length ? reviewed.filter((t) => t.followed).length / reviewed.length : null,
    reviewed: reviewed.length,
  };
}
