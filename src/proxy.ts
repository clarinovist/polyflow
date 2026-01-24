import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale, localePrefix } from './i18n/config';

const intlMiddleware = createMiddleware({
    locales,
    defaultLocale,
    localePrefix
});

const { auth } = NextAuth(authConfig);

export default auth((req) => {
    return intlMiddleware(req);
});

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
