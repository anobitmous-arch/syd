'use strict';
const jwt = require('jsonwebtoken');

const SECRET = process.env.SYD_JWT_SECRET || 'dev_secret_change_me';
const COOKIE = 'syd_token';
const TTL = 60 * 60 * 24 * 7; // 7 days in seconds

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: TTL });
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

function setAuthCookie(res, payload) {
  const token = sign(payload);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TTL * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = verify(token);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

module.exports = { sign, verify, setAuthCookie, clearAuthCookie, requireAuth };
