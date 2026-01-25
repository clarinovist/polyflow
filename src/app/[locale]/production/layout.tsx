import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ProductionSidebar } from '@/components/production/production-sidebar';
import { ClockDisplay } from '../kiosk/ClockDisplay';
import { AdminBackButton } from '@/components/layout/admin-back-button';

export default async function ProductionLayout({
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
        role: (session.user as { role?: string }).role || 'PRODUCTION',
    };

    // Check for PRODUCTION, PPIC, or ADMIN role
    const isAuthorized = user.role === 'ADMIN' ||
        user.role === 'PRODUCTION' ||
        user.role === 'PPIC';

    if (!isAuthorized) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
            {/* Dedicated Production Sidebar */}
            <ProductionSidebar user={user} />

            <div className="flex-1 flex flex-col ml-64 min-h-screen">
                {/* Header for Superintendent Portal */}
                <header className="sticky top-0 z-30 w-full border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-6 h-16 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <div>
                            <h1 className="text-md font-bold text-slate-800 dark:text-slate-100">Superintendent Portal</h1>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Floor Control Mode</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <ClockDisplay />
                    </div>
                </header>

                <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/50 p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
