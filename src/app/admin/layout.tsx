import { auth } from '@/auth';
import { AdminNav } from '@/components/layout/admin-nav';
import { redirect } from 'next/navigation';
import { canAccessWorkspace } from '@/lib/auth/access-policy';
import { SidebarSpacer } from '@/components/layout/sidebar-spacer';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session) {
        redirect('/login');
    }

    if (!canAccessWorkspace(session.user, 'admin')) {
        redirect('/dashboard');
    }

    const user = {
        name: session.user?.name,
        email: session.user?.email,
        role: (session.user as { role?: string }).role || 'WAREHOUSE',
        image: session.user?.image,
    };

    return (
        <div className="min-h-screen bg-secondary/30">
            <AdminNav user={user} />

            {/* Main Content */}
            <SidebarSpacer>
                <main className="min-h-screen">
                    <div className="p-4 md:p-6 lg:p-8">{children}</div>
                </main>
            </SidebarSpacer>
        </div>
    );
}
