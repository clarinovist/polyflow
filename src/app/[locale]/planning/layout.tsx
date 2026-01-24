import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PlanningSidebar } from '@/components/planning/planning-sidebar';

export default async function PlanningLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    // Allow PPIC, PROCUREMENT, and ADMIN roles
    const role = session.user.role?.toUpperCase();
    const allowedRoles = ['PPIC', 'PROCUREMENT', 'ADMIN'];
    if (!role || !allowedRoles.includes(role)) {
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
