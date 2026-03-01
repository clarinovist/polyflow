import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

const BASE_DOMAIN = 'polyflow.uk';

const handler = auth((req) => {
	const host = req.headers.get('host') || '';
	const hostname = host.split(':')[0];
	const requestHeaders = new Headers(req.headers);

	// SECURITY: Always clear any client-provided x-tenant-subdomain header to prevent tenant spoofing
	requestHeaders.delete('x-tenant-subdomain');

	// Extract tenant subdomain (e.g. "acme" from "acme.polyflow.uk")
	if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
		const tenant = hostname.replace(`.${BASE_DOMAIN}`, '');
		if (tenant && tenant !== 'www') {
			requestHeaders.set('x-tenant-subdomain', tenant);
		}
	}

	const response = NextResponse.next({
		request: { headers: requestHeaders },
	});

	// SECURITY: Add missing HTTP security headers
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Strict-Transport-Security',
		'max-age=31536000; includeSubDomains; preload'
	);

	return response;
});

export default function proxy(...args: Parameters<typeof handler>) {
	return handler(...args);
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)'],
};
