// NOTE: THIS is the active Next.js middleware in production (see `config.matcher`
// at the bottom). A stale `middleware.ts` also exists at the repo root but is NOT
// what runs — debug auth/routing here, not there.
//
// Tenant subdomain detection MUST go through the shared `extractSubdomain()`
// helper below (single source of truth for RESERVED_SUBDOMAINS: admin, www,
// app, ...). Do NOT reintroduce an inline host-parsing block with a partial
// exclusion list — doing so previously made admin.polyflow.uk emit
// `x-tenant-subdomain: admin`, which `auth.ts` prioritizes over the Host header,
// breaking superadmin login with TenantNotFound.
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/api/rate-limit";
import { extractSubdomain } from "@/lib/core/tenant";

const { auth } = NextAuth(authConfig);

const BASE_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "polyflow.uk";

const handler = auth((req) => {
  const host = req.headers.get("host") || "";
  const hostname = host.split(":")[0];
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);

  // SECURITY: Always clear any client-provided x-tenant-subdomain header to prevent tenant spoofing
  requestHeaders.delete("x-tenant-subdomain");

  // Extract tenant subdomain. Uses the shared helper so reserved subdomains
  // (admin, www, app, ...) are consistently NOT treated as tenants.
  const tenant = extractSubdomain(host);

  // Detect admin subdomain (admin.polyflow.uk)
  const isAdminSubdomain = hostname === `admin.${BASE_DOMAIN}`;

  if (isAdminSubdomain) {
    requestHeaders.set("x-admin-subdomain", "true");
  }

  // Only set the tenant header for real tenants (reserved subdomains resolve
  // against the main DB). This prevents admin.polyflow.uk from being routed to
  // a non-existent tenant DB during superadmin login.
  if (tenant) {
    requestHeaders.set("x-tenant-subdomain", tenant);
  }

  // Admin subdomain root → redirect to login
  if (isAdminSubdomain && req.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Tenant subdomain root → redirect to login
  if (tenant && req.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Rate Limiting for API routes only (not navigation)
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const forwardedFor =
      req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";
    const { success } = rateLimit(ip);

    if (!success) {
      return new NextResponse(
        JSON.stringify({ error: "Too Many Requests. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // SECURITY: Add missing HTTP security headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );

  const csp = `
		default-src 'self';
		script-src 'self' 'unsafe-inline';
		style-src 'self' 'unsafe-inline';
		img-src 'self' data: https: blob:;
		font-src 'self' data:;
		connect-src 'self' https:;
		object-src 'none';
		base-uri 'self';
		form-action 'self';
	`
    .replace(/\s{2,}/g, " ")
    .trim();

  response.headers.set("Content-Security-Policy", csp);

  return response;
});

export default function proxy(...args: Parameters<typeof handler>) {
  return handler(...args);
}

export const config = {
  matcher: [
    // Intercept everything except static assets and standard bypasses
    "/((?!_next/static|_next/image|images|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)",
  ],
};
