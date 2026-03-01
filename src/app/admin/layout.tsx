import { auth } from '@/auth';
import { getMyPermissions } from '@/actions/permissions';
import { AdminNav } from '@/components/layout/admin-nav';
import { redirect } from 'next/navigation';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
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
    await getMyPermissions();

    return (
        <div className="min-h-screen bg-secondary/30">
            <AdminNav user={user} />

            {/* Main Content */}
            <main className="lg:ml-64 min-h-screen">
                <div className="p-4 md:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
