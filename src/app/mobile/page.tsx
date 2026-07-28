import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getAvailableMobilePortals } from '@/lib/mobile/mobile-access-policy';
import { MobileAccountMenu } from '@/components/layout/mobile-account-menu';
import Link from 'next/link';
import { Package, Factory, ShoppingBag, ChevronRight, Layers } from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Pilih Portal Mobile | PolyFlow',
};

const ICON_MAP = {
    sales: ShoppingBag,
    warehouse: Package,
    production: Factory,
};

export default async function MobileSelectorPage() {
    const session = await auth();

    if (!session) {
        redirect('/login');
    }

    const user = {
        name: session.user?.name,
        email: session.user?.email,
        role: (session.user as { role?: string }).role,
        roles: (session.user as { roles?: string[] }).roles,
        image: session.user?.image,
        avatarUrl: (session.user as { avatarUrl?: string }).avatarUrl,
    };

    const portals = getAvailableMobilePortals(user);

    if (portals.length === 0) {
        redirect('/device/desktop-required');
    }

    if (portals.length === 1) {
        redirect(portals[0].path);
    }

    return (
        <div className="min-h-dvh bg-slate-950 text-slate-50 flex flex-col font-sans">
            {/* Header */}
            <header className="sticky top-0 z-40 h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                        <Layers className="h-4 w-4" />
                    </div>
                    <span className="font-bold text-sm tracking-wide text-slate-100">
                        PolyFlow Mobile
                    </span>
                </div>
                <MobileAccountMenu user={user} />
            </header>

            {/* Main Selector */}
            <main className="flex-1 max-w-md w-full mx-auto p-5 flex flex-col justify-center gap-6">
                <div className="space-y-1.5">
                    <h1 className="text-2xl font-bold tracking-tight text-white">
                        Pilih Portal
                    </h1>
                    <p className="text-sm text-slate-400">
                        Selamat datang, <span className="text-slate-200 font-medium">{user.name || user.email}</span>. Pilih ruang kerja operasional Anda:
                    </p>
                </div>

                <div className="space-y-3.5">
                    {portals.map((portal) => {
                        const Icon = ICON_MAP[portal.id] || Layers;
                        return (
                            <Link
                                key={portal.id}
                                href={portal.path}
                                className="group block p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 active:scale-[0.98] transition-all shadow-md hover:shadow-blue-500/10"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3.5">
                                        <div className="h-12 w-12 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0 border border-blue-500/20">
                                            <Icon className="h-6 w-6" />
                                        </div>
                                        <div className="space-y-0.5 min-w-0">
                                            <h2 className="font-semibold text-base text-slate-100 group-hover:text-blue-400 transition-colors">
                                                {portal.title}
                                            </h2>
                                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                                                {portal.description}
                                            </p>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                                </div>
                            </Link>
                        );
                    })}
                </div>

                <p className="text-center text-xs text-slate-500 pt-4">
                    Membutuhkan fitur back-office desktop? Gunakan peramban komputer/laptop.
                </p>
            </main>
        </div>
    );
}
