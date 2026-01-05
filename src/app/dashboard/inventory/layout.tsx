'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
    { label: 'Overview', href: '/dashboard/inventory' },
    { label: 'Transfer', href: '/dashboard/inventory/transfer' },
    { label: 'Adjustment', href: '/dashboard/inventory/adjustment' },
    { label: 'Stock Opname', href: '/dashboard/inventory/opname' },
    { label: 'History', href: '/dashboard/inventory/history' },
];

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen">
            {/* Sub-navigation for Inventory */}
            <div className="border-b border-slate-200 bg-white">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-slate-900">Inventory Management</h2>
                        <nav className="flex gap-2">
                            {navItems.map((item) => {
                                const pathname = usePathname();
                                const isActive = pathname === item.href;
                                return (
                                    <Link key={item.href} href={item.href}>
                                        <Button
                                            variant={isActive ? "secondary" : "ghost"}
                                            size="sm"
                                            className={cn(isActive && "font-semibold")}
                                        >
                                            {item.label}
                                        </Button>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </div>
            </div>
            <div className="container mx-auto p-4">
                {children}
            </div>
        </div>
    );
}
