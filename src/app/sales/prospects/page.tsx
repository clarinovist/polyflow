import { listProspectsAction } from '@/actions/sales/field-prospect';
import { PageHeader } from '@/components/ui/page-header';
import { serializeData } from '@/lib/utils/utils';
import { ProspectQueueClient } from './ProspectQueueClient';

export default async function SalesProspectsPage() {
    const prospectsRes = await listProspectsAction({ page: 1, pageSize: 100 });

    const prospectsData =
        prospectsRes?.success && prospectsRes.data
            ? serializeData(prospectsRes.data)
            : {
                  customers: [],
                  total: 0,
                  page: 1,
                  pageSize: 100,
                  totalPages: 0,
              };

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
            <PageHeader
                title="Antrian Prospek"
                description="Verifikasi customer prospek hasil kanvasing lapangan. Cek duplikat sebelum menyetujui."
            />
            <ProspectQueueClient initialData={prospectsData} />
        </div>
    );
}
