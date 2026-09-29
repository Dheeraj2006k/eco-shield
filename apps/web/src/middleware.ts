import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, can, requiredCapForPath } from '@iris/config';
import { authSecret, verifySession } from '@/lib/auth';

const PUBLIC_PATHS = ['/', '/login', '/forbidden', '/document', '/api/auth', '/api/health'];

function isPublic(path: string) {
  return PUBLIC_PATHS.some((p) => (p === '/' ? path === '/' : path === p || path.startsWith(p + '/')));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, authSecret());
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const cap = requiredCapForPath(pathname);
  if (cap && !can(session.role, cap)) {
    const url = req.nextUrl.clone();
    url.pathname = '/forbidden';
    url.search = `?path=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf|docx|doc)$).*)'],
};
