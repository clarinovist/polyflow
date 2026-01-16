'use client';

import { useState } from 'react';
import { WorkShift, Role } from '@prisma/client';
import { ShiftList } from './ShiftList';
import { ShiftPageHeader } from './ShiftPageHeader';
import { GeneralSettings } from './GeneralSettings';
import { UsersTab } from './UsersTab';
import { AccessControlTab } from './AccessControlTab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings as SettingsIcon, User, Layers, Users, Lock, Monitor, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

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

export function SettingsTabs({ shifts, currentUserRole }: SettingsTabsProps) {
    const isAdmin = currentUserRole === 'ADMIN';
    const [activeTab, setActiveTab] = useState<TabValue>('general');

    const tabs: TabItem[] = [
        { value: 'general', label: 'General', icon: User, description: 'Manage your profile and preferences' },
        ...(isAdmin ? [
            { value: 'production', label: 'Production', icon: Layers, description: 'Manage shifts and operational configurations' } as TabItem,
            { value: 'users', label: 'Users', icon: Users, description: 'Manage system users and roles' } as TabItem,
            { value: 'access', label: 'Access Control', icon: Lock, description: 'Configure permissions for each role' } as TabItem,
        ] : []),
        { value: 'system', label: 'System', icon: Monitor, description: 'View system health and version' },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'general':
                return (
                    <div className="space-y-6">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold tracking-tight">General Settings</h2>
                            <p className="text-muted-foreground">
                                Manage your profile and application preferences.
                            </p>
                        </div>
                        <GeneralSettings />
                    </div>
                );
            case 'production':
                return isAdmin ? (
                    <div className="space-y-6">
                        <div className="border-b pb-6">
                            <ShiftPageHeader />
                            <div className="mt-6">
                                <ShiftList shifts={shifts} />
                            </div>
                        </div>
                    </div>
                ) : null;
            case 'users':
                return isAdmin ? (
                    <div className="space-y-6">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
                            <p className="text-muted-foreground">
                                Add, edit, or remove users and assign roles.
                            </p>
                        </div>
                        <UsersTab />
                    </div>
                ) : null;
            case 'access':
                return isAdmin ? (
                    <div className="space-y-6">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold tracking-tight">Access Control</h2>
                            <p className="text-muted-foreground">
                                Define permissions and access levels for different roles.
                            </p>
                        </div>
                        <AccessControlTab />
                    </div>
                ) : null;
            case 'system':
                return (
                    <div className="space-y-6">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold tracking-tight">System Configuration</h2>
                            <p className="text-muted-foreground">
                                View system information and status.
                            </p>
                        </div>
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
                                    <span className="text-sm text-emerald-600 font-medium text-right">Online</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
            <aside className="-mx-4 lg:w-1/5">
                <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
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
            <div className="flex-1 lg:max-w-4xl">
                {renderContent()}
            </div>
        </div>
    );
}
