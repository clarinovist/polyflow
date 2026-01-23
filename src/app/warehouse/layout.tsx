import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { WarehouseSidebar } from '@/components/warehouse/warehouse-sidebar';
import { ClockDisplay } from '../kiosk/ClockDisplay';
import { AdminBackButton } from '@/components/layout/admin-back-button';

export default async function WarehouseLayout({
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
        role: (session.user as { role?: string }).role || 'WAREHOUSE',
    };

    // Check for PRODUCTION, WAREHOUSE, PPIC, or ADMIN role
    const isAuthorized = user.role === 'ADMIN' ||
        user.role === 'PRODUCTION' ||
        user.role === 'WAREHOUSE' ||
        user.role === 'PPIC';

    if (!isAuthorized) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Dedicated Warehouse Sidebar */}
            <WarehouseSidebar user={user} />

            <div className="flex-1 flex flex-col ml-64 min-h-screen">
                {/* Simplified Header for Utility (Clock, Context) */}
                <header className="sticky top-0 z-30 w-full border-b bg-white/80 backdrop-blur-md px-6 h-16 flex items-center justify-between shadow-sm">
                    <div>
                        <h1 className="text-md font-bold text-slate-800">Warehouse Workspace</h1>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">PolyFlow ERP</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <ClockDisplay />
                        <AdminBackButton role={user.role} />
                    </div>
                </header>

                <main className="flex-1 overflow-hidden">
                    {children}
                </main>
            </div>
        </div>
    );
}
