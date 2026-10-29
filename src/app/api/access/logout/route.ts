import { NextResponse } from 'next/server';
import { ACCESS_COOKIE } from '@/lib/access-session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
