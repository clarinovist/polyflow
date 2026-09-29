import type { Session } from 'next-auth';
import { getMainPrisma } from '@/lib/core/prisma';
import { getCentralWorkspaceOptions } from '@/lib/auth/central-workspaces';
import { MobileAccountMenu } from './mobile-account-menu';

/** Server component: identity inputs come only from the caller's auth() session. */
export async function MobileAccountMenuServer({
    user,
    accentColor,
}: {
    user?: Session['user'];
    accentColor?: string;
}) {
    if (!user) return null;

    let currentTenantName: string | undefined;
    let workspaces: Awaited<ReturnType<typeof getCentralWorkspaceOptions>> = [];
    let workspacesUnavailable = false;

    if (user.tenantId) {
        try {
            const tenant = await getMainPrisma().tenant.findUnique({
                where: { id: user.tenantId },
                select: { name: true },
            });
            currentTenantName = tenant?.name;
            if (currentTenantName) {
                workspaces = await getCentralWorkspaceOptions(user.globalAccountId);
            }
        } catch {
            // Optional navigation must not take down the active mobile portal.
            workspacesUnavailable = true;
        }
    }

    return (
        <MobileAccountMenu
            user={{
                name: user.name,
                role: user.role,
                image: user.image,
                avatarUrl: (user as { avatarUrl?: string }).avatarUrl,
            }}
            accentColor={accentColor}
            currentTenantId={user.tenantId}
            currentTenantName={currentTenantName}
            workspaces={workspaces}
            workspacesUnavailable={workspacesUnavailable}
        />
    );
}
