import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

const BASE_DOMAIN = 'polyflow.uk';

const handler = auth((req) => {
	const host = req.headers.get('host') || '';
	const hostname = host.split(':')[0];
	const requestHeaders = new Headers(req.headers);

	// Extract tenant subdomain (e.g. "acme" from "acme.polyflow.uk")
	if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
		const tenant = hostname.replace(`.${BASE_DOMAIN}`, '');
		if (tenant && tenant !== 'www') {
			requestHeaders.set('x-tenant-subdomain', tenant);
		}
	}

	return NextResponse.next({
		request: { headers: requestHeaders },
	});
});

export default function proxy(...args: Parameters<typeof handler>) {
	return handler(...args);
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)'],
};
