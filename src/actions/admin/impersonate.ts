"use server";

import { prisma, getTenantDb } from "@/lib/core/prisma";
import { auth, signIn } from "@/auth";
import { AuthorizationError, BusinessRuleError } from "@/lib/errors/errors";
import { Role } from "@prisma/client";
import { logActivity } from "@/lib/tools/audit";
import { redirect } from "next/navigation";

const IMPERSONATION_TTL_SECONDS = 30 * 60; // 30 minutes hard expiry

/**
 * Start impersonating a tenant's primary admin user.
 *
 * Flow:
 * 1. Verify superadmin session.
 * 2. Look up the tenant's oldest ADMIN user (tenant DB).
 * 3. Call signIn('credentials', ...) with a special `impersonationBy` field —
 *    authorize() in auth.ts detects this and skips the password check, tagging
 *    the resulting JWT with `impersonatedBy=<superAdminId>` and a 30-minute
 *    hard expiry.
 * 4. Audit-log the impersonation start.
 * 5. Redirect to the tenant's dashboard.
 *
 * Because signIn() sets the session cookie for the CURRENT host, and we want
 * the session to live on the tenant's subdomain instead, this redirects to a
 * callback URL on the tenant subdomain. But signIn() with redirect:false
 * sets the cookie on the current (admin) subdomain, which won't carry over.
 *
 * So we use a different approach: signIn() with redirect=false here, then
 * redirect manually to `https://<subdomain>.polyflow.uk/super-admin` — wait,
 * that won't work either because the cookie is on admin.polyflow.uk.
 *
 * The cleanest fix: since polyflow.uk is the apex and cookies set with
 * domain=.polyflow.uk are shared across all subdomains, and NextAuth by
 * default sets cookies on the current host (not apex). BUT our existing
 * cookie config (`__Secure-authjs.session-token`) uses the default domain,
 * which is admin.polyflow.uk — NOT shared.
 *
 * Workaround that doesn't require cookie-domain changes: do the signIn() here
 * (on admin subdomain), then issue a 302 to the tenant subdomain. The cookie
 * won't carry — so the tenant subdomain won't see the session.
 *
 * => REAL approach: signIn() must run on the TENANT subdomain. We do this by
 * redirecting to a one-time use URL on the tenant subdomain that does the
 * signIn there. That URL carries a short-lived signed token verifying that
 * the superadmin authorized the impersonation.
 *
 * To keep this simple and avoid adding a new public endpoint with token
 * validation, we use a SIMPLER approach here:
 * - signIn() on admin subdomain sets a session cookie scoped to admin.* — we
 *   DELIBERATELY DON'T redirect to the tenant subdomain.
 * - Instead, we render the tenant's data directly on the admin subdomain via
 *   a special "impersonation view" route /admin/impersonate/[tenantId].
 * - This avoids cookie-domain issues entirely.
 *
 * Implementation below uses that simpler approach.
 */
export async function impersonateTenant(tenantId: string) {
    const session = await auth();
    if (!session?.user || !session.user.isSuperAdmin) {
        throw new AuthorizationError("Super Admin access required.");
    }
    const superAdminId = session.user.id!;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.dbUrl) {
        throw new BusinessRuleError("Tenant tidak ditemukan atau tidak ada DB URL.");
    }
    if (tenant.status === "SUSPENDED") {
        throw new BusinessRuleError("Tidak dapat impersonate ke tenant yang di-suspend. Reaktivasi dulu.");
    }

    // Look up primary admin (oldest ADMIN user) in the tenant DB.
    const tenantDb = getTenantDb(tenant.dbUrl);
    const adminUser = await tenantDb.user.findFirst({
        where: { role: Role.ADMIN },
        orderBy: { createdAt: "asc" },
    });
    if (!adminUser) {
        throw new BusinessRuleError("Tidak ada user admin di tenant ini untuk di-impersonate.");
    }
    if (adminUser.isActive === false) {
        throw new BusinessRuleError("User admin tidak aktif di tenant ini. Aktifkan melalui manajemen user.");
    }

    const expiresAt = Math.floor(Date.now() / 1000) + IMPERSONATION_TTL_SECONDS;

    await logActivity({
        userId: superAdminId,
        action: "IMPERSONATION_STARTED",
        entityType: "Tenant",
        entityId: tenantId,
        details: `Started impersonating tenant "${tenant.name}" as user ${adminUser.email} (expiry in ${IMPERSONATION_TTL_SECONDS / 60} min).`,
        changes: { tenantId, targetUserId: adminUser.id, targetEmail: adminUser.email, expiresAt },
    });

    // Do NOT use signIn's redirect — we control the redirect ourselves.
    // The dummy password is required by authorize()'s Zod schema (.min(6)) but
    // is ignored when impersonationBy is present.
    await signIn("credentials", {
        email: adminUser.email,
        password: "impersonation-dummy-not-real",
        role: "ADMIN",
        subdomain: tenant.subdomain,
        impersonationBy: superAdminId,
        impersonationExpiresAt: expiresAt,
        redirect: false,
    });

    // Redirect to an impersonation-aware view on admin.polyflow.uk.
    // We keep the user on the ADMIN subdomain (where the session cookie lives)
    // and render tenant-context actions there. The banner shows they're in
    // impersonation mode with an Exit button.
    // NOTE: reading tenant data inside the impersonation view MUST use
    // getTenantDb(tenant.dbUrl) explicitly — the AsyncLocalStorage pipe that
    // routes requests on tenant subdomains to the right tenant DB doesn't
    // help here because we're on the admin subdomain.
    redirect(`/admin/impersonate?tenantId=${tenantId}&userId=${adminUser.id}`);
}
