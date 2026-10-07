import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-access';

export default async function SalesFieldLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireMobilePortalPageAccess('sales-field');
    return children;
}
