import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gate runs at the edge, before any page renders.
 *
 * getToken verifies the JWT cookie signature with NEXTAUTH_SECRET - it does
 * not call the database or the /api/auth/session endpoint, which is what makes
 * a JWT session strategy cheap to check on every request.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = await getToken({
    req: request,
    secret: process.env['NEXTAUTH_SECRET'] ?? '',
  });
  const isAuthenticated = token !== null;

  if (pathname.startsWith('/dashboard') && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    // Preserve where they were heading so login can return them there.
    loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Only the routes that actually need a decision. Excluding /api/auth is
  // essential: running the gate over the sign-in callback would redirect the
  // OAuth handshake and the login could never complete.
  matcher: ['/dashboard/:path*', '/login'],
};
