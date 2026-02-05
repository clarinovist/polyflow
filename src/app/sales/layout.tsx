import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SalesSidebar } from '@/components/sales/sales-sidebar';

export default async function SalesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    // Only allow SALES and ADMIN roles
    const role = session.user.role?.toUpperCase();
    if (role !== 'SALES' && role !== 'ADMIN') {
        redirect('/dashboard?error=Unauthorized');
    }

    return (
        <div className="min-h-screen bg-background">
            <SalesSidebar user={session.user} />
            <main className="lg:ml-64 min-h-screen">
                <div className="p-4 md:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
