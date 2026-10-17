import { auth } from '@/auth';
import { getMainPrisma } from '@/lib/core/prisma';
import { AuthorizationError } from '@/lib/errors/errors';

export async function requireLearningOwner(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id || !session.user.isSuperAdmin) throw new AuthorizationError('Akses learning terbatas untuk superadmin.');
    const owner = await getMainPrisma().user.findUnique({ where: { id: session.user.id }, select: { isActive: true, isSuperAdmin: true } });
    if (!owner?.isActive || !owner.isSuperAdmin) throw new AuthorizationError('Akses learning tidak tersedia.');
    return session.user.id;
}
