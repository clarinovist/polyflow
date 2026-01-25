import NextAuth from 'next-auth';
import createMiddleware from 'next-intl/middleware';

import { authConfig } from './auth.config';
import { locales, defaultLocale, localePrefix } from './i18n/config';

const intlMiddleware = createMiddleware({
    locales,
    defaultLocale,
    localePrefix,
});

// Keep middleware Edge-compatible by using `authConfig` only
// (do not import `@/auth` here since it pulls Prisma/bcrypt).
const { auth } = NextAuth(authConfig);

export default auth((req) => {
    return intlMiddleware(req);
});

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)'],
};
