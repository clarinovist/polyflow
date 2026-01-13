import { auth } from '@/auth';
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

    return (
        <div className="min-h-screen bg-secondary/30">
            <SidebarNav user={user} />

            {/* Main Content */}
            <main className="ml-64">
                {children}
            </main>
        </div>
    );
}
