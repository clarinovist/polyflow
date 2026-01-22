import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import Link from 'next/link';
import { ClockDisplay } from '../kiosk/ClockDisplay';

export default async function WarehouseLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session) {
        redirect('/login');
    }

    // Check for PRODUCTION, WAREHOUSE, PPIC, or ADMIN role
    const isAuthorized = session.user.role === 'ADMIN' ||
        session.user.role === 'PRODUCTION' ||
        session.user.role === 'WAREHOUSE' ||
        session.user.role === 'PPIC';
    if (!isAuthorized) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Simplified Mobile-Optimized Header */}
            <header className="sticky top-0 z-50 w-full border-b bg-white px-4 h-16 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard">
                        <PolyFlowLogo showText={false} className="w-8 h-8" />
                    </Link>
                    <div>
                        <h1 className="text-lg font-bold leading-none">Warehouse Portal</h1>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Material Fulfillment</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <ClockDisplay />
                </div>
            </header>

            <main className="flex-1 flex flex-col overflow-hidden">
                {children}
            </main>
        </div>
    );
}
