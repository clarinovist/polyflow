import NextAuth from 'next-auth';
import createMiddleware from 'next-intl/middleware';

import { authConfig } from './auth.config';
import { locales, defaultLocale, localePrefix } from './i18n/config';

const intlMiddleware = createMiddleware({
	locales,
	defaultLocale,
	localePrefix,
	localeDetection: false,
});

// Keep Proxy compatible with runtime constraints by using `authConfig` only.
// Do not import `@/auth` here (it pulls Prisma/bcrypt).
const { auth } = NextAuth(authConfig);

const handler = auth((req) => {
	console.log(`[PROXY] ----------------------------------------------------------------`);
	console.log(`[PROXY] Incoming request: ${req.nextUrl.pathname}`);
	console.log(`[PROXY] Auth status: ${!!req.auth ? 'Authenticated' : 'Not Authenticated'}`);
	if (req.auth?.user) {
		console.log(`[PROXY] User Role: ${req.auth.user.role}`);
	}

	const response = intlMiddleware(req);

	if (response) {
		console.log(`[PROXY] Intl response status: ${response.status}`);
		if (response.headers.has('location')) {
			console.log(`[PROXY] Intl Redirect -> ${response.headers.get('location')}`);
		}
	}

	return response;
});

export default function proxy(...args: Parameters<typeof handler>) {
	// console.log('[PROXY] Proxy entry point hit');
	return handler(...args);
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)'],
};
