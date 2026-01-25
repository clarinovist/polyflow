import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SalesSidebar } from '@/components/sales/sales-sidebar';

export default async function SalesLayout({
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

    // Only allow SALES and ADMIN roles
    const role = session.user.role?.toUpperCase();
    if (role !== 'SALES' && role !== 'ADMIN') {
        redirect(`/${locale}/dashboard?error=Unauthorized`);
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
