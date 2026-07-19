import { requireAuth } from '@/lib/tools/auth-checks';
import { PageHeader } from '@/components/ui/page-header';
import { PaymentBanksSettings } from '@/components/finance/PaymentBanksSettings';

export const metadata = {
    title: 'Rekening Bank Pembayaran | Polyflow Finance',
    description: 'Kelola nomor rekening perusahaan untuk metode pembayaran Transfer BCA/Mandiri.',
};

export default async function PaymentBanksPage() {
    const session = await requireAuth();
    const role = (session.user as { role?: string })?.role;
    const canEdit = role === 'ADMIN' || role === 'FINANCE';

    return (
        <div className="space-y-6 pb-20">
            <PageHeader
                title="Rekening Bank Pembayaran"
                description="Nomor rekening perusahaan yang dipakai pada label metode pembayaran dan clearing Cek/Giro."
            />
            <PaymentBanksSettings canEdit={canEdit} />
        </div>
    );
}
