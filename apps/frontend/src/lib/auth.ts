import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

const REQUIRED_VARS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'NEXTAUTH_SECRET',
] as const;

/**
 * Warns rather than throws.
 *
 * Throwing at module load would be a better error message but it breaks
 * `next build`, which imports the route to collect page data - so the app
 * could not be built at all until someone had a Google OAuth client. Missing
 * credentials instead surface as NextAuth's `Configuration` error, which
 * /login renders as readable text.
 */
function readAuthEnv(name: (typeof REQUIRED_VARS)[number]): string {
  return process.env[name] ?? '';
}

const missing = REQUIRED_VARS.filter((name) => readAuthEnv(name).trim() === '');
if (missing.length > 0) {
  console.warn(
    `[auth] missing ${missing.join(', ')} - Google sign-in will fail until these ` +
      'are set in the workspace-root .env. See README Setup.',
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: readAuthEnv('GOOGLE_CLIENT_ID'),
      clientSecret: readAuthEnv('GOOGLE_CLIENT_SECRET'),
    }),
  ],

  secret: readAuthEnv('NEXTAUTH_SECRET'),

  // JWT rather than a database session: the session lives in a signed cookie,
  // so no session table is needed and middleware can authorise an request by
  // verifying the token without a round trip to MySQL.
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    jwt({ token, profile }) {
      // Google's `sub` is the stable account identifier; `email` is what the
      // backend records as Campaign.createdBy.
      // Guarded rather than `?? token.sub`: under exactOptionalPropertyTypes an
      // optional property cannot be assigned `undefined` explicitly.
      if (profile?.sub !== undefined) {
        token.sub = profile.sub;
      }
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
      }
      return session;
    },
  },
};
