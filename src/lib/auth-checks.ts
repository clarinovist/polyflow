import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';

/**
 * Ensures a user is authenticated.
 * Redirects to login if not.
 */
export async function requireAuth() {
    const session = await auth();
    if (!session?.user || !session.user.id) {
        redirect('/login');
    }

    // Verify user exists in DB to prevent Foreign Key errors (stale sessions)
    // and ensure role is up to date if needed
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true }
    });

    if (!user) {
        // Stale session, force logout via client-side page
        redirect('/logout');
    }

    // Optional: Sync role from DB to session object if we want strict role checks
    // session.user.role = user.role;

    return session;
}

/**
 * Ensures a user is authenticated and has a specific role.
 * Throws an error if not.
 * Admin role is typically allowed for all operations unless strictly specified otherwise.
 */
export async function requireRole(requiredRole: Role | Role[]) {
    const session = await requireAuth();
    const userRole = session.user.role;

    if (!userRole) {
        throw new Error('Unauthorized: User has no role');
    }

    // Admin usually has access to everything
    if (userRole === 'ADMIN') {
        return session;
    }

    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

    if (!roles.includes(userRole as Role)) {
        throw new Error(`Unauthorized: Insufficient permissions. Required: ${roles.join(' or ')}`);
    }

    return session;
}
