import { NextResponse } from 'next/server';
import { sendAccessCode } from '@/lib/access-mail';
import { hashOtp, OTP_COOLDOWN_MS, makeOtpCode } from '@/lib/access-session';
import { loadAccessDirectory, saveAccessDirectory } from '@/lib/access-store';
import { putOtp, resolveUser } from '@/lib/access-auth';
import { normalizeEmail } from '@/lib/access-model';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = normalizeEmail(String(body.email || ''));
  if (!email.includes('@')) return NextResponse.json({ error: 'Pon un correo.' }, { status: 400 });

  const loaded = await loadAccessDirectory();
  const user = resolveUser(loaded.directory, email);
  if (!user) return NextResponse.json({ error: 'Ese correo no está dado de alta.' }, { status: 403 });

  const previous = loaded.directory.otps.find((item) => item.email === email);
  if (previous && Date.now() - previous.sentAt < OTP_COOLDOWN_MS) {
    return NextResponse.json({ error: 'Espera un momento y vuelve a pedirlo.' }, { status: 429 });
  }

  const code = makeOtpCode();
  const next = putOtp(loaded.directory, email, hashOtp(email, code));
  try {
    await saveAccessDirectory(next);
  } catch {
    return NextResponse.json({ error: 'Falta crear la tabla access_store en Supabase.' }, { status: 500 });
  }
  const mail = await sendAccessCode(email, code);
  if (!mail.mailed) {
    return NextResponse.json({
      ok: true,
      mailed: false,
      error: 'No se ha podido mandar el correo. Pide el código a Operaciones.',
    });
  }
  return NextResponse.json({ ok: true, mailed: true });
}
