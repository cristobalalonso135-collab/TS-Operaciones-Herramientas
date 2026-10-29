import { asUser, normalizeEmail, type AccessDirectory, type AccessUser } from '@/lib/access-model';
import { isOwnerEmail, OTP_TTL_MS } from '@/lib/access-session';

export function publicUser(user: AccessUser): Pick<AccessUser, 'email' | 'name' | 'role'> {
  return { email: user.email, name: user.name, role: user.role };
}

export function resolveUser(directory: AccessDirectory, email: string): AccessUser | null {
  const key = normalizeEmail(email);
  const row = directory.users.find((item) => item.email === key);
  if (isOwnerEmail(key)) {
    return asUser({
      ...(row || { id: key, email: key, name: key.split('@')[0], createdAt: new Date().toISOString() }),
      email: key,
      role: 'admin',
      active: true,
    });
  }
  if (!row || !row.active) return null;
  return row;
}

export function putOtp(directory: AccessDirectory, email: string, hash: string): AccessDirectory {
  const key = normalizeEmail(email);
  const now = Date.now();
  return {
    users: directory.users,
    otps: [
      ...directory.otps.filter((item) => item.email !== key && item.expiresAt > now),
      { email: key, hash, expiresAt: now + OTP_TTL_MS, sentAt: now },
    ],
  };
}

export function takeOtp(directory: AccessDirectory, email: string) {
  const key = normalizeEmail(email);
  const now = Date.now();
  const hit = directory.otps.find((item) => item.email === key && item.expiresAt > now);
  return {
    otp: hit || null,
    directory: {
      users: directory.users,
      otps: directory.otps.filter((item) => item.email !== key && item.expiresAt > now),
    },
  };
}
