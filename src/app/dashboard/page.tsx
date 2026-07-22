import { auth } from '@/auth';
import { getExecutiveStats } from '@/actions/dashboard/dashboard';
import { getMyPermissions } from '@/actions/admin/permissions';
import DashboardClient from './DashboardClient';
import { serializeData } from '@/lib/utils/utils';

export default async function DashboardPage() {
    const session = await auth();
    const stats = await getExecutiveStats();
    const permissionsRes = await getMyPermissions();

    const sessionAllowed =
        (session?.user as { allowedResources?: string[] } | undefined)?.allowedResources || [];
    const permissions: string[] | 'ALL' =
        permissionsRes.success && permissionsRes.data
            ? permissionsRes.data
            : sessionAllowed.length > 0
              ? sessionAllowed
              : [];

    const userName = session?.user?.name || session?.user?.email || 'Pengguna';
    const userRole =
        (session?.user as { role?: string } | undefined)?.role || 'ADMIN';

    return (
        <DashboardClient
            stats={serializeData(stats.success && stats.data ? stats.data : null)}
            userName={userName}
            userRole={userRole}
            permissions={permissions}
        />
    );
}
