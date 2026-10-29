import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, cookieOptions, hashOtp, isBootstrapPin, sameHash, signSession } from '@/lib/access-session';
import { loadAccessDirectory, saveAccessDirectory } from '@/lib/access-store';
import { publicUser, resolveUser, takeOtp } from '@/lib/access-auth';
import { normalizeEmail } from '@/lib/access-model';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: string; code?: string };
  const email = normalizeEmail(String(body.email || ''));
  const code = String(body.code || '').replace(/\s/g, '');

  const loaded = await loadAccessDirectory();

  if (isBootstrapPin(code) && loaded.directory.users.length === 0) {
    const user = {
      id: 'owner',
      email: email.includes('@') ? email : 'operaciones@local',
      name: 'Operaciones',
      role: 'admin' as const,
      active: true,
      createdAt: new Date().toISOString(),
    };
    const response = NextResponse.json({ ok: true, user: publicUser(user) });
    response.cookies.set(ACCESS_COOKIE, signSession(user), cookieOptions());
    return response;
  }

  const user = resolveUser(loaded.directory, email);
  if (!user) return NextResponse.json({ error: 'Ese correo no está dado de alta.' }, { status: 403 });
  const taken = takeOtp(loaded.directory, email);
  if (!taken.otp || !sameHash(taken.otp.hash, hashOtp(email, code))) {
    return NextResponse.json({ error: 'Código incorrecto o caducado.' }, { status: 401 });
  }
  await saveAccessDirectory(taken.directory);
  const response = NextResponse.json({ ok: true, user: publicUser(user) });
  response.cookies.set(ACCESS_COOKIE, signSession(user), cookieOptions());
  return response;
}
