import NextAuth from 'next-auth';
import createMiddleware from 'next-intl/middleware';

import { authConfig } from './auth.config';
import { locales, defaultLocale, localePrefix } from './i18n/config';

const intlMiddleware = createMiddleware({
	locales,
	defaultLocale,
	localePrefix,
});

// Keep Proxy compatible with runtime constraints by using `authConfig` only.
// Do not import `@/auth` here (it pulls Prisma/bcrypt).
const { auth } = NextAuth(authConfig);

const handler = auth((req) => {
	return intlMiddleware(req);
});

export default function proxy(request: Parameters<typeof handler>[0]) {
	return handler(request);
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)'],
};
