import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { FinanceSidebar } from '@/components/finance/finance-sidebar';
import { canAccessWorkspace } from '@/lib/auth/access-policy';
import { PathBreadCrumb } from '@/components/layout/path-breadcrumb';
import { SidebarSpacer } from '@/components/layout/sidebar-spacer';

export default async function FinanceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    if (!canAccessWorkspace(session.user, 'finance')) {
        redirect('/dashboard?error=Unauthorized');
    }

    return (
        <div className="min-h-screen bg-background">
            <FinanceSidebar user={session.user} />
            <SidebarSpacer>
                <main className="min-h-screen">
                    <div className="p-4 md:p-6 lg:p-8">
                        <PathBreadCrumb />
                        {children}
                    </div>
                </main>
            </SidebarSpacer>
        </div>
    );
}
