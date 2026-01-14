import { auth } from '@/auth';
import { getMyPermissions } from '@/actions/permissions';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();

    if (!session) {
        redirect('/login');
    }

    const user = {
        name: session.user?.name,
        email: session.user?.email,
        role: (session.user as { role?: string }).role || 'WAREHOUSE',
    };

    // Fetch permissions for the sidebar
    // Admin gets 'ALL' by default from the action logic, but let's be explicit if needed
    // The getMyPermissions action handles the 'ALL' logic for admins.
    const permissions = await getMyPermissions();

    return (
        <div className="min-h-screen bg-secondary/30">
            <SidebarNav user={user} permissions={permissions} />

            {/* Main Content */}
            <main className="ml-64">
                {children}
            </main>
        </div>
    );
}
