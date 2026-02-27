import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

const handler = auth((req) => {
	// Extract subdomain for Multi-Tenant routing
	const host = req.headers.get('host') || '';
	const hostname = host.split(':')[0]; // Remove port if present
	const subdomain = hostname.split('.')[0];

	const requestHeaders = new Headers(req.headers);

	// Skip inserting for localhost/127.0.0.1 directly, or standard prefixes like 'app'/'www'
	// Also skip if subdomain is 'polyflow' (main domain) or not present
	if (
		subdomain &&
		subdomain !== 'localhost' &&
		subdomain !== '127' &&
		subdomain !== 'app' &&
		subdomain !== 'www' &&
		subdomain !== 'polyflow' &&
		!(hostname === 'polyflow.uk' || hostname === 'www.polyflow.uk')
	) {
		requestHeaders.set('x-tenant-subdomain', subdomain);
	}

	// Pass original request with modified headers to the downstream components
	return NextResponse.next({
		request: {
			headers: requestHeaders,
		}
	});
});

export default function proxy(...args: Parameters<typeof handler>) {
	return handler(...args);
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)'],
};
