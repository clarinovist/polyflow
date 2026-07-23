'use client';

import {
    ShieldCheck,
    Warehouse,
    Factory,
    ClipboardList,
    TrendingUp,
    Receipt,
    Users,
    ShoppingCart,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { roleSelectionLabels as L } from '@/lib/labels/auth';
import { LOGIN_ROLES, getRoleLabel } from '@/lib/auth/system-roles';

export type RoleType = 'ADMIN' | 'WAREHOUSE' | 'PRODUCTION' | 'PLANNING' | 'SALES' | 'FINANCE' | 'PROCUREMENT' | 'HRD' | 'KIOSK';

type SelectableRole = keyof typeof L.roles;

const ICON_MAP: Record<string, React.ElementType> = {
    ADMIN: ShieldCheck,
    WAREHOUSE: Warehouse,
    PRODUCTION: Factory,
    PLANNING: ClipboardList,
    SALES: TrendingUp,
    FINANCE: Receipt,
    PROCUREMENT: ShoppingCart,
    HRD: Users,
};

const COLOR_MAP: Record<string, string> = {
    ADMIN: 'text-blue-500 bg-blue-500/10',
    WAREHOUSE: 'text-amber-500 bg-amber-500/10',
    PRODUCTION: 'text-emerald-500 bg-emerald-500/10',
    PLANNING: 'text-purple-500 bg-purple-500/10',
    SALES: 'text-rose-500 bg-rose-500/10',
    FINANCE: 'text-cyan-500 bg-cyan-500/10',
    PROCUREMENT: 'text-orange-500 bg-orange-500/10',
    HRD: 'text-indigo-500 bg-indigo-500/10',
};

const roles = LOGIN_ROLES.map((r) => ({
    id: r.value as SelectableRole,
    icon: ICON_MAP[r.value] ?? ShieldCheck,
    color: COLOR_MAP[r.value] ?? 'text-gray-500 bg-gray-500/10',
}));

interface RoleSelectionProps {
    onSelectRole: (role: RoleType) => void;
}

export default function RoleSelection({ onSelectRole }: RoleSelectionProps) {
    return (
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <div className="mb-6 sm:mb-10 text-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 sm:mb-3">
                    {L.heading}
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground">
                    {L.subtitle}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {roles.map((role) => {
                    const labels = L.roles[role.id];
                    const title = labels?.title ?? getRoleLabel(role.id);
                    const description = labels?.description ?? '';
                    return (
                    <button
                        key={role.id}
                        onClick={() => onSelectRole(role.id)}
                        className="group relative flex items-start p-5 rounded-2xl border border-border bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 text-left overflow-hidden active:scale-[0.98]"
                    >
                        <div className={cn("p-3 rounded-xl mr-4 transition-colors duration-300", role.color)}>
                            <role.icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">
                                {title}
                            </h3>
                            {description && (
                            <p className="text-sm text-muted-foreground leading-snug mt-1">
                                {description}
                            </p>
                            )}
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </button>
                    );
                })}
            </div>

        </div>
    );
}
