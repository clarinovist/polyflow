import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PlanningSidebar } from '@/components/planning/planning-sidebar';

export default async function PlanningLayout({
    children,
    params
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const session = await auth();
    const { locale } = await params;

    if (!session?.user) {
        redirect(`/${locale}/login`);
    }

    // Allow PPIC, PROCUREMENT, and ADMIN roles
    const role = session.user.role?.toUpperCase();
    const allowedRoles = ['PLANNING', 'PROCUREMENT', 'ADMIN'];
    if (!role || !allowedRoles.includes(role)) {
        redirect(`/${locale}/dashboard?error=Unauthorized`);
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
