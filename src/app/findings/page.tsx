import { PageHeader } from '@/components/ui/page-header';
import { FindingsClient } from '@/components/findings/FindingsClient';
import { listMyFindings } from '@/actions/findings/finding-actions';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Temuan | PolyFlow',
    description:
        'Hal yang perlu ditindaklanjuti, terdeteksi otomatis oleh sistem.',
};

export default async function FindingsPage() {
    const res = await listMyFindings();
    const initialFindings = res.success && res.data ? res.data : [];

    return (
        <div className="p-6 space-y-6">
            <PageHeader
                title="Temuan"
                description="Hal yang perlu ditindaklanjuti, terdeteksi otomatis oleh sistem — stok kritis, produksi macet, dan lainnya."
            />
            <FindingsClient initialFindings={initialFindings} />
        </div>
    );
}
