'use client';

import {
    ShieldCheck,
    Warehouse,
    Factory,
    ClipboardList,
    TrendingUp,
    Monitor,
    Receipt,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export type RoleType = 'ADMIN' | 'WAREHOUSE' | 'PRODUCTION' | 'PPIC' | 'SALES' | 'FINANCE' | 'KIOSK';

interface RoleOption {
    id: RoleType;
    titleKey: string;
    descriptionKey: string;
    icon: React.ElementType;
    color: string;
}

const roles: RoleOption[] = [
    {
        id: 'ADMIN',
        titleKey: 'ADMIN.title',
        descriptionKey: 'ADMIN.description',
        icon: ShieldCheck,
        color: 'text-blue-500 bg-blue-500/10'
    },
    {
        id: 'WAREHOUSE',
        titleKey: 'WAREHOUSE.title',
        descriptionKey: 'WAREHOUSE.description',
        icon: Warehouse,
        color: 'text-amber-500 bg-amber-500/10'
    },
    {
        id: 'PRODUCTION',
        titleKey: 'PRODUCTION.title',
        descriptionKey: 'PRODUCTION.description',
        icon: Factory,
        color: 'text-emerald-500 bg-emerald-500/10'
    },
    {
        id: 'PPIC',
        titleKey: 'PPIC.title',
        descriptionKey: 'PPIC.description',
        icon: ClipboardList,
        color: 'text-purple-500 bg-purple-500/10'
    },
    {
        id: 'SALES',
        titleKey: 'SALES.title',
        descriptionKey: 'SALES.description',
        icon: TrendingUp,
        color: 'text-rose-500 bg-rose-500/10'
    },
    {
        id: 'FINANCE',
        titleKey: 'FINANCE.title',
        descriptionKey: 'FINANCE.description',
        icon: Receipt,
        color: 'text-cyan-500 bg-cyan-500/10'
    }
];

interface RoleSelectionProps {
    onSelectRole: (role: RoleType) => void;
}

export default function RoleSelection({ onSelectRole }: RoleSelectionProps) {
    const t = useTranslations('auth.roles');

    return (
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <div className="mb-6 sm:mb-10 text-center">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 sm:mb-3">
                    {t('title')}
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground">
                    {t('subtitle')}
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
                                {t(role.titleKey)}
                            </h3>
                            <p className="text-sm text-muted-foreground leading-snug mt-1">
                                {t(role.descriptionKey)}
                            </p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </button>
                ))}
            </div>

            <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-sm uppercase">
                    <span className="bg-background px-4 text-muted-foreground font-medium tracking-wider">
                        {t('floorDivider')}
                    </span>
                </div>
            </div>

            <div className="mt-8">
                <button
                    onClick={() => onSelectRole('KIOSK')}
                    className="group w-full relative flex items-center justify-between p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all duration-300 text-left active:scale-[0.99]"
                >
                    <div className="flex items-center">
                        <div className="p-4 rounded-2xl bg-primary text-primary-foreground mr-5 shadow-lg shadow-primary/20">
                            <Monitor className="h-8 w-8" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">
                                {t('kiosk.title')}
                            </h3>
                            <p className="text-muted-foreground font-medium">
                                {t('kiosk.description')}
                            </p>
                        </div>
                    </div>
                    <div className="h-12 w-12 rounded-full border border-primary/20 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                        <ArrowRight className="h-6 w-6" />
                    </div>
                </button>
            </div>
        </div>
    );
}
