import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

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

	// i18n removed - pass through
	return;
});

export default function proxy(...args: Parameters<typeof handler>) {
	return handler(...args);
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)'],
};
