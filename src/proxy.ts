import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

const BASE_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'polyflow.uk';

import { rateLimit } from '@/lib/rate-limit';

const handler = auth((req) => {
	const host = req.headers.get('host') || '';
	const hostname = host.split(':')[0];
	const requestHeaders = new Headers(req.headers);

	// SECURITY: Always clear any client-provided x-tenant-subdomain header to prevent tenant spoofing
	requestHeaders.delete('x-tenant-subdomain');

	// Extract tenant subdomain
	// Handle specific localhost format (e.g. tenant.localhost) or staging/prod domains
	let tenant = null;

	// Check if it's a localhost testing environment like `kiyowo.localhost`
	if (hostname.endsWith('.localhost')) {
		tenant = hostname.replace('.localhost', '');
	} else if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
		tenant = hostname.replace(`.${BASE_DOMAIN}`, '');
	}

	if (tenant && tenant !== 'www' && tenant !== 'app') {
		requestHeaders.set('x-tenant-subdomain', tenant);
	}

	// Rate Limiting Logic - Temporarily disabled for standard navigation
	// Next.js middleware fires for prefetching, images, and API calls. 100 req/min is easily exceeded.
	// const forwardedFor = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
	// const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
	// const { success } = rateLimit(ip);

	// if (!success) {
	// 	return new NextResponse(
	// 		JSON.stringify({ error: "Too Many Requests. Please try again later." }),
	// 		{ status: 429, headers: { 'Content-Type': 'application/json' } }
	// 	);
	// }

	const response = NextResponse.next({
		request: { headers: requestHeaders },
	});

	// SECURITY: Add missing HTTP security headers
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-XSS-Protection', '1; mode=block');
	response.headers.set(
		'Strict-Transport-Security',
		'max-age=31536000; includeSubDomains; preload'
	);

	const csp = `
		default-src 'self';
		script-src 'self' 'unsafe-eval' 'unsafe-inline';
		style-src 'self' 'unsafe-inline';
		img-src 'self' data: https: blob:;
		font-src 'self' data:;
		connect-src 'self' https:;
	`.replace(/\s{2,}/g, ' ').trim();

	response.headers.set('Content-Security-Policy', csp);

	return response;
});

export default function proxy(...args: Parameters<typeof handler>) {
	return handler(...args);
}

export const config = {
	matcher: [
		// Intercept everything except static assets, Sentry monitoring, and standard bypasses
		'/((?!monitoring|_next/static|_next/image|images|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)'
	],
};
