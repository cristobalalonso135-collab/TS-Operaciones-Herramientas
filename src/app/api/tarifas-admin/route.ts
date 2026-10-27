import { NextResponse } from 'next/server';
import { adminPin, otpauthUrl, totpConfigured, verifyTotp } from '@/lib/tarifas-totp';

export async function GET() {
  return NextResponse.json({ totp: totpConfigured() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { pin?: string; code?: string };
  const pin = String(body.pin || '').trim();
  const code = String(body.code || '').trim();

  if (pin && pin === adminPin()) {
    return NextResponse.json({ ok: true, otpauth: otpauthUrl() });
  }
  if (code && verifyTotp(code)) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}
