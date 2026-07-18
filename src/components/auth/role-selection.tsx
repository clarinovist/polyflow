'use client';

import {
    ShieldCheck,
    Warehouse,
    Factory,
    ClipboardList,
    TrendingUp,
    Receipt,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { roleSelectionLabels as L } from '@/lib/labels/auth';

export type RoleType = 'ADMIN' | 'WAREHOUSE' | 'PRODUCTION' | 'PLANNING' | 'SALES' | 'FINANCE' | 'KIOSK';

type SelectableRole = keyof typeof L.roles;

interface RoleOption {
    id: SelectableRole;
    icon: React.ElementType;
    color: string;
}

const roles: RoleOption[] = [
    { id: 'ADMIN', icon: ShieldCheck, color: 'text-blue-500 bg-blue-500/10' },
    { id: 'WAREHOUSE', icon: Warehouse, color: 'text-amber-500 bg-amber-500/10' },
    { id: 'PRODUCTION', icon: Factory, color: 'text-emerald-500 bg-emerald-500/10' },
    { id: 'PLANNING', icon: ClipboardList, color: 'text-purple-500 bg-purple-500/10' },
    { id: 'SALES', icon: TrendingUp, color: 'text-rose-500 bg-rose-500/10' },
    { id: 'FINANCE', icon: Receipt, color: 'text-cyan-500 bg-cyan-500/10' },
];

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
                {roles.map((role) => (
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
                                {L.roles[role.id].title}
                            </h3>
                            <p className="text-sm text-muted-foreground leading-snug mt-1">
                                {L.roles[role.id].description}
                            </p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </button>
                ))}
            </div>

        </div>
    );
}
