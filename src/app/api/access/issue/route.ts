import { NextResponse } from 'next/server';
import { sendAccessCode } from '@/lib/access-mail';
import { currentSession, hashOtp, makeOtpCode, OTP_COOLDOWN_MS } from '@/lib/access-session';
import { loadAccessDirectory, saveAccessDirectory } from '@/lib/access-store';
import { putOtp, resolveUser } from '@/lib/access-auth';
import { normalizeEmail } from '@/lib/access-model';

export async function POST(request: Request) {
  const session = currentSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'No.' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = normalizeEmail(String(body.email || ''));
  const loaded = await loadAccessDirectory();
  const user = resolveUser(loaded.directory, email);
  if (!user) return NextResponse.json({ error: 'Ese correo no está en la lista.' }, { status: 404 });

  const previous = loaded.directory.otps.find((item) => item.email === email);
  if (previous && Date.now() - previous.sentAt < OTP_COOLDOWN_MS) {
    return NextResponse.json({ error: 'Espera un momento y vuelve a mandarlo.' }, { status: 429 });
  }

  const code = makeOtpCode();
  try {
    await saveAccessDirectory(putOtp(loaded.directory, email, hashOtp(email, code)));
  } catch {
    return NextResponse.json({ error: 'Falta crear la tabla access_store en Supabase.' }, { status: 500 });
  }
  const mail = await sendAccessCode(email, code);
  return NextResponse.json({
    ok: true,
    mailed: mail.mailed,
    code: mail.mailed ? undefined : code,
    error: mail.mailed ? undefined : 'No se ha podido mandar el correo. Pásale este código tú.',
  });
}
