import { auth } from '@/auth';
import { Role } from '@prisma/client';

/**
 * Ensures a user is authenticated.
 * Throws an error if not.
 */
export async function requireAuth() {
    const session = await auth();
    if (!session?.user || !session.user.id) {
        throw new Error('Unauthorized: Please log in');
    }
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
