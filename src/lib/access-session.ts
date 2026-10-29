import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { adminPin } from '@/lib/tarifas-totp';
import { isAccessRole, normalizeEmail, type AccessRole, type AccessUser } from '@/lib/access-model';

export const ACCESS_COOKIE = 'ts_access';
export const ACCESS_TTL_SEC = 60 * 60 * 24 * 14;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_COOLDOWN_MS = 45 * 1000;

export type AccessSession = {
  email: string;
  name: string;
  role: AccessRole;
  exp: number;
};

export function accessSecret(): string {
  return process.env.ACCESS_SECRET || process.env.TARIFAS_ADMIN_TOTP_SECRET || 'ts-access-dev-only';
}

export function ownerEmails(): string[] {
  const raw = [process.env.ACCESS_OWNER_EMAIL, process.env.ACCESS_OWNER_EMAILS].filter(Boolean).join(',');
  return raw.split(',').map(normalizeEmail).filter((item) => item.includes('@'));
}

export function isOwnerEmail(email: string): boolean {
  return ownerEmails().includes(normalizeEmail(email));
}

export function hashOtp(email: string, code: string): string {
  return createHmac('sha256', accessSecret()).update(`${normalizeEmail(email)}:${code}`).digest('hex');
}

export function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signSession(user: Pick<AccessUser, 'email' | 'name' | 'role'>): string {
  const payload = Buffer.from(JSON.stringify({
    email: normalizeEmail(user.email),
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SEC,
  } satisfies AccessSession)).toString('base64url');
  const sig = createHmac('sha256', accessSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readSessionToken(token: string | undefined | null): AccessSession | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', accessSecret()).update(payload).digest('base64url');
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessSession;
    if (!session.email || !isAccessRole(session.role) || session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACCESS_TTL_SEC,
  };
}

export function currentSession(): AccessSession | null {
  return readSessionToken(cookies().get(ACCESS_COOKIE)?.value);
}

export function makeOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function isBootstrapPin(code: string): boolean {
  return code.trim() === adminPin();
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function accessRequired(): boolean {
  const raw = (process.env.ACCESS_REQUIRED || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function requireAdminSession(): AccessSession | null {
  if (!accessRequired()) {
    return { email: 'operaciones@local', name: 'Operaciones', role: 'admin', exp: 0 };
  }
  const session = currentSession();
  if (!session || session.role !== 'admin') return null;
  return session;
}
