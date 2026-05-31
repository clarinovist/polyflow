import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PlanningSidebar } from '@/components/planning/planning-sidebar';
import { canAccessWorkspace } from '@/lib/auth/access-policy';

export default async function PlanningLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    if (!canAccessWorkspace(session.user, 'planning')) {
        redirect('/dashboard?error=Unauthorized');
    }

    return (
        <div className="min-h-screen bg-background">
            <PlanningSidebar user={session.user} />
            <main className="lg:ml-64 min-h-screen">
                <div className="p-4 md:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
