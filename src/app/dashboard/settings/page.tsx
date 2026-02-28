import { SettingsTabs } from '@/components/settings/SettingsTabs';
import { auth } from '@/auth';
import { headers } from 'next/headers';

export default async function SettingsPage() {
    const session = await auth();
    const reqHeaders = await headers();

    let subdomain = reqHeaders.get('x-tenant-subdomain');
    if (!subdomain) {
        let host = reqHeaders.get('host') || '';
        host = host.split(':')[0]; // Remove port
        const hostParts = host.split('.');
        if (hostParts.length > 2 && !['localhost', '127', 'app', 'www', 'polyflow'].includes(hostParts[0])) {
            subdomain = hostParts[0];
        }
    }

    const tenantName = subdomain ? `Tenant: ${subdomain.toUpperCase()}` : 'Main Database (Production Replica)';

    // Default to WAREHOUSE if no role found (safe fallback)
    const userRole = session?.user?.role || 'WAREHOUSE';
    const userName = session?.user?.name || undefined;
    const userEmail = session?.user?.email || undefined;

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-6">Settings</h1>
            <SettingsTabs currentUserRole={userRole} tenantName={tenantName} currentUserName={userName} currentUserEmail={userEmail} />
        </div>
    );
}
