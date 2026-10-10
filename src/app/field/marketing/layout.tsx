import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ChartNoAxesCombined } from 'lucide-react';
import { auth } from '@/auth';
import { MarketingBottomNav } from '@/components/field/MarketingBottomNav';
import { FieldMobileFrame } from '@/components/field/FieldMobileFrame';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';
import { MobilePortalHeader, MobilePortalShell } from '@/components/mobile';
import { isMobileUserAgent } from '@/lib/mobile/mobile-access-policy';
import { requireMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';

export default async function MarketingMobileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireMobilePortalPageAccess('marketing-supervisor');
    const session = await auth();
    if (!session) redirect('/login');

    const content = (
        <MobilePortalShell
            contentId="field-marketing-content"
            telemetryPortalId="marketing-supervisor"
            className="bg-background dark:bg-background"
            header={
                <MobilePortalHeader
                    title="Marketing Supervisor"
                    icon={
                        <ChartNoAxesCombined
                            aria-hidden="true"
                            className="h-5 w-5 text-teal-700 dark:text-teal-300"
                        />
                    }
                    actions={
                        <MobileAccountMenuServer
                            user={session.user}
                            accentColor="bg-teal-700"
                        />
                    }
                />
            }
            bottomNavigation={<MarketingBottomNav />}
        >
            {children}
        </MobilePortalShell>
    );

    const userAgent = (await headers()).get('user-agent') ?? '';
    return isMobileUserAgent(userAgent) ? (
        content
    ) : (
        <FieldMobileFrame>{content}</FieldMobileFrame>
    );
}
