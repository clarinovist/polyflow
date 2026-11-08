import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { auth } from '@/auth';
import { listMyFindings } from '@/actions/findings/finding-actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { groupFindings } from '@/lib/findings/finding-groups';
import {
    toFindingViews,
    type SerializedFindingRow,
} from '@/lib/findings/finding-view';
import { FindingsInbox } from './FindingsInbox';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Temuan | PolyFlow',
    robots: { index: false, follow: false },
};

/**
 * The edge lets this path through for anyone (it is not a workspace), and
 * layouts are not a safe place for access checks, so the page authenticates
 * itself. Visibility per finding is enforced inside listMyFindings.
 */
export default async function FindingsPage() {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) redirect('/login');

    const result = await listMyFindings();
    if (!result.success) {
        return (
            <div className="space-y-6">
                <PageHeader title="Temuan" />
                <Alert variant="destructive">
                    <AlertTitle>Temuan belum bisa dimuat</AlertTitle>
                    <AlertDescription>{result.error}</AlertDescription>
                </Alert>
            </div>
        );
    }

    const findings = toFindingViews(result.data as SerializedFindingRow[]);
    const sections = groupFindings(findings, userId);
    const needsAttention = findings.filter((f) => f.status !== 'SNOOZED').length;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Temuan"
                description={
                    findings.length === 0
                        ? 'Kondisi bermasalah yang perlu ditindaklanjuti.'
                        : `${needsAttention} perlu ditangani, ${findings.length - needsAttention} ditunda.`
                }
            />
            {findings.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
                    <CheckCircle2
                        className="h-8 w-8 text-emerald-600"
                        aria-hidden="true"
                    />
                    <p className="font-medium">Tidak ada temuan terbuka</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                        Semua kondisi yang Anda pantau sedang beres. Temuan baru
                        muncul di sini otomatis.
                    </p>
                </div>
            ) : (
                <FindingsInbox
                    sections={sections}
                    myUserId={userId}
                    nowIso={new Date().toISOString()}
                />
            )}
        </div>
    );
}
