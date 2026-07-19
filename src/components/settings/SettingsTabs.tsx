'use client';

import { Role } from '@prisma/client';
import { GeneralSettings } from './GeneralSettings';
import { UsersTab } from './UsersTab';
import { AccessControlTab } from './AccessControlTab';
import { CompanySettings } from './CompanySettings';
import { NotificationSettings } from './NotificationSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings as SettingsIcon, User, Users, Lock, Monitor, Building2, Bell, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { buttonVariants } from '@/components/ui/button';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { settingsLabels } from '@/lib/labels';

interface SettingsTabsProps {
    currentUserRole: Role;
    tenantName?: string;
    currentUserName?: string;
    currentUserEmail?: string;
    currentUserLocale?: string;
    currentUserAvatarUrl?: string | null;
    appVersion?: string;
    environment?: string;
}

type TabValue = 'general' | 'company' | 'notifications' | 'users' | 'access' | 'system';

interface TabItem {
    value: TabValue;
    label: string;
    icon: LucideIcon;
    description: string;
}

export function SettingsTabs({
    currentUserRole,
    tenantName,
    currentUserName,
    currentUserEmail,
    currentUserLocale,
    currentUserAvatarUrl,
    appVersion,
    environment,
}: SettingsTabsProps) {
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
        { value: 'general', label: settingsLabels.general, icon: User, description: settingsLabels.generalDesc },
        { value: 'notifications', label: settingsLabels.notifications, icon: Bell, description: settingsLabels.notificationsDesc },
        ...(isAdmin ? [
            { value: 'company', label: settingsLabels.company, icon: Building2, description: settingsLabels.companyDesc } as TabItem,
            { value: 'users', label: settingsLabels.users, icon: Users, description: settingsLabels.usersDesc } as TabItem,
            { value: 'access', label: settingsLabels.accessControl, icon: Lock, description: settingsLabels.accessControlDesc } as TabItem,
        ] : []),
        { value: 'system', label: settingsLabels.system, icon: Monitor, description: settingsLabels.systemDesc },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'general':
                return (
                    <GeneralSettings
                        tenantName={tenantName}
                        userName={currentUserName}
                        userEmail={currentUserEmail}
                        userLocale={currentUserLocale}
                        userAvatarUrl={currentUserAvatarUrl}
                    />
                );
            case 'notifications':
                return <NotificationSettings />;
            case 'company':
                return isAdmin ? <CompanySettings /> : null;
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
                                {settingsLabels.systemInfo}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 py-2 border-b">
                                <span className="text-sm font-medium">{settingsLabels.erpVersion}</span>
                                <span className="text-sm text-muted-foreground text-right">
                                    {appVersion ? `v${appVersion}` : '—'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 py-2 border-b">
                                <span className="text-sm font-medium">{settingsLabels.environment}</span>
                                <span className="text-sm text-muted-foreground text-right capitalize">
                                    {environment || '—'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 py-2">
                                <span className="text-sm font-medium">{settingsLabels.serverStatus}</span>
                                <span className="text-sm text-green-500 font-medium text-right">{settingsLabels.online}</span>
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
