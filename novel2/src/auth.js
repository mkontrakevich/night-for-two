import crypto from 'node:crypto';
import {config} from './config.js';

function safeEqualHex(a, b) {
  try {
    const aa = Buffer.from(String(a || ''), 'hex');
    const bb = Buffer.from(String(b || ''), 'hex');
    return aa.length > 0 && aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

export function roleForUser(userId) {
  const id = String(userId || '');
  if (id && id === config.ownerId) return 'A';
  if (id && id === config.partnerId) return 'B';
  if (config.localTest && id === 'local_a') return 'A';
  if (config.localTest && id === 'local_b') return 'B';
  return '';
}

export function verifyTelegramInitData(initData) {
  const raw = String(initData || '');
  if (!raw || !config.botToken) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get('hash') || '';
  params.delete('hash');

  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const calculated = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (!safeEqualHex(calculated, hash)) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch {}
  const id = String(user?.id || '');
  const role = roleForUser(id);
  return role ? {id, role, user} : null;
}

export function authenticate(req) {
  if (config.localTest) {
    const id = String(req.headers['x-novel2-local-user'] || '');
    const role = roleForUser(id);
    if (role) return {id, role, user:{id, first_name:role === 'A' ? 'Player A' : 'Player B'}};
  }
  return verifyTelegramInitData(req.headers['x-telegram-init-data']);
}
