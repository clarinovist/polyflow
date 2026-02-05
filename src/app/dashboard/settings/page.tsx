import { SettingsTabs } from '@/components/settings/SettingsTabs';
import { auth } from '@/auth';

export default async function SettingsPage() {
    const session = await auth();

    // Default to WAREHOUSE if no role found (safe fallback)
    const userRole = session?.user?.role || 'WAREHOUSE';

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-6">Settings</h1>
            <SettingsTabs currentUserRole={userRole} />
        </div>
    );
}
