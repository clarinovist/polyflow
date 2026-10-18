import Link from 'next/link';
import { fetchOwnerLearning } from '@/actions/admin/owner-learning';
import { OwnerLearningView } from './owner-learning-view';
import { ownerLearningPolicy } from '@/lib/learning/owner-contracts';
import { requireLearningOwner } from '@/lib/learning/authorization';

export const metadata = { title: 'Owner Insights | PolyFlow' };
export default async function OwnerLearningPage({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
    if (!ownerLearningPolicy().enabled) {
        await requireLearningOwner();
        return <div className="space-y-4"><h1 className="text-2xl font-semibold">Owner Insights belum aktif</h1><p>Binding akun owner, daftar tenant, dan tanggal prospektif harus diverifikasi sebelum insight privat tersedia.</p><Link className="underline" href="/admin/learning">Kembali ke Learning Center</Link></div>;
    }
    const { tenant } = await searchParams;
    return <OwnerLearningView data={await fetchOwnerLearning(tenant)} />;
}
