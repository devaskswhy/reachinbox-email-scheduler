import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      /** Google's stable account id, copied from the JWT `sub` claim. */
      id: string;
    } & DefaultSession['user'];
  }
}
