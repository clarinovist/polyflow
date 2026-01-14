import { getWorkShifts } from '@/actions/work-shifts';
import { SettingsTabs } from '@/components/settings/SettingsTabs';
import { auth } from '@/auth';

export default async function SettingsPage() {
    const session = await auth();
    const result = await getWorkShifts();
    const shifts = result.success && result.data ? result.data : [];

    // Default to WAREHOUSE if no role found (safe fallback)
    const userRole = session?.user?.role || 'WAREHOUSE';

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
                <p className="text-muted-foreground mt-2">Manage system configuration and preferences.</p>
            </div>
            <SettingsTabs shifts={shifts} currentUserRole={userRole} />
        </div>
    );
}
