'use client';

import { Role } from '@prisma/client';
import { isTenantAdmin } from '@/lib/auth/roles';
import { GeneralSettings } from './GeneralSettings';
import { UsersTab } from './UsersTab';
import { AccessControlTab } from './AccessControlTab';
import { CompanySettings } from './CompanySettings';
import { NotificationSettings } from './NotificationSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings as SettingsIcon, User, Users, Lock, Monitor, Building2, Bell, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { settingsLabels } from '@/lib/labels';

interface SettingsTabsProps {
    currentUserRole: Role;
    currentUserRoles: string[];
    currentUserId?: string;
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
    currentUserRoles,
    currentUserId,
    tenantName,
    currentUserName,
    currentUserEmail,
    currentUserLocale,
    currentUserAvatarUrl,
    appVersion,
    environment,
}: SettingsTabsProps) {
    const isAdmin = isTenantAdmin({ role: currentUserRole, roles: currentUserRoles });
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
                    <UsersTab currentUserId={currentUserId} />
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
        <div>
            <nav
                className="flex overflow-x-auto gap-1 border-b mb-6 -mx-1 px-1 scrollbar-thin"
                role="tablist"
                aria-label="Settings sections"
            >
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.value;
                    return (
                        <button
                            key={tab.value}
                            role="tab"
                            aria-selected={isActive}
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => setActiveTab(tab.value as TabValue)}
                            className={cn(
                                "inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                isActive
                                    ? "border-primary text-foreground"
                                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                            )}
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </nav>
            <div className="min-w-0">{renderContent()}</div>
        </div>
    );
}
