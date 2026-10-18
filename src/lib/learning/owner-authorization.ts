import { auth } from '@/auth';
import { getMainPrisma } from '@/lib/core/prisma';
import { AuthorizationError } from '@/lib/errors/errors';
import { ownerLearningPolicy } from './owner-contracts';

/** An unrelated superadmin must not inherit the private owner's data scope. */
export async function requirePrivateLearningOwner() {
    const policy = ownerLearningPolicy();
    const session = await auth();
    const claims = session?.user as NonNullable<typeof session>['user'] & { impersonatedBy?: string; impersonationExpiresAt?: number } | undefined;
    if (!policy.enabled || !claims?.isSuperAdmin || claims.id !== policy.ownerId ||
        claims.tenantId || claims.tenantSubdomain || claims.globalAccountId || claims.membershipId ||
        claims.impersonatedBy || claims.impersonationExpiresAt) {
        throw new AuthorizationError('Insight privat hanya tersedia untuk owner yang dikonfigurasi.');
    }
    const owner = await getMainPrisma().user.findUnique({ where: { id: policy.ownerId }, select: { isActive: true, isSuperAdmin: true } });
    if (!owner?.isActive || !owner.isSuperAdmin) throw new AuthorizationError('Akses owner tidak aktif.');
    return policy;
}
