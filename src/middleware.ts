import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { accessRequired } from '@/lib/access-flags';

function allowed(pathname: string): boolean {
  if (pathname === '/tarifas') return true;
  if (pathname.startsWith('/api/access')) return true;
  if (pathname.startsWith('/api/tarifas')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname === '/site.webmanifest') return true;
  return false;
}

export function middleware(request: NextRequest) {
  if (!accessRequired()) return NextResponse.next();
  if (allowed(request.nextUrl.pathname)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/tarifas';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
