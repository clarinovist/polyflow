'use client';

import { WorkShift, Role } from '@prisma/client';
import { GeneralSettings } from './GeneralSettings';
import { UsersTab } from './UsersTab';
import { AccessControlTab } from './AccessControlTab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings as SettingsIcon, User, Users, Lock, Monitor, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

interface SettingsTabsProps {
    shifts: WorkShift[];
    currentUserRole: Role;
}

type TabValue = 'general' | 'production' | 'users' | 'access' | 'system';

interface TabItem {
    value: TabValue;
    label: string;
    icon: LucideIcon;
    description: string;
}

export function SettingsTabs({ currentUserRole }: Omit<SettingsTabsProps, 'shifts'>) {
    const isAdmin = currentUserRole === 'ADMIN';
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const activeTab = (searchParams.get('tab') as TabValue) || 'general';

    const setActiveTab = (tab: TabValue) => {
        // Clean update of URL query param
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tab);
        router.push(`${pathname}?${params.toString()}`);
    };

    const tabs: TabItem[] = [
        { value: 'general', label: 'General', icon: User, description: 'Manage your profile and preferences' },
        ...(isAdmin ? [
            { value: 'users', label: 'Users', icon: Users, description: 'Manage system users and roles' } as TabItem,
            { value: 'access', label: 'Access Control', icon: Lock, description: 'Configure permissions for each role' } as TabItem,
        ] : []),
        { value: 'system', label: 'System', icon: Monitor, description: 'View system health and version' },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'general':
                return (
                    <GeneralSettings />
                );
            case 'users':
                return isAdmin ? (
                    <UsersTab />
                ) : null;
            case 'access':
                return isAdmin ? (
                    <AccessControlTab />
                ) : null;
            case 'system':
                return (
                    <Card className="max-w-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <SettingsIcon className="h-5 w-5" />
                                System Info
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 py-2 border-b">
                                <span className="text-sm font-medium">ERP Version</span>
                                <span className="text-sm text-muted-foreground text-right">0.1.5-beta</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 py-2 border-b">
                                <span className="text-sm font-medium">Environment</span>
                                <span className="text-sm text-muted-foreground text-right">Development</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 py-2">
                                <span className="text-sm font-medium">Server Status</span>
                                <span className="text-sm text-green-500 font-medium text-right">Online</span>
                            </div>
                        </CardContent>
                    </Card>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
            <aside className="lg:w-48 shrink-0 lg:sticky lg:top-6 lg:h-fit">
                <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1 overflow-x-auto pb-2 lg:pb-0">
                    {tabs.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value as TabValue)}
                            className={cn(
                                buttonVariants({ variant: "ghost" }),
                                activeTab === tab.value
                                    ? "bg-muted hover:bg-muted"
                                    : "hover:bg-transparent hover:underline",
                                "justify-start"
                            )}
                        >
                            <tab.icon className="mr-2 h-4 w-4" />
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </aside>
            <div className="flex-1 min-w-0">
                {renderContent()}
            </div>
        </div>
    );
}
