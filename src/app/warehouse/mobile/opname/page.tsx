import { getOpnameSessions } from '@/actions/inventory/opname';
import { serializeData } from '@/lib/utils/utils';
import { MobileOpnameListClient } from './MobileOpnameListClient';
import { MobileReadError } from '@/components/mobile';

export default async function MobileOpnameListPage() {
    const result = await getOpnameSessions();
    if (!result.success) {
        return <MobileReadError title="Daftar stock opname belum tersedia" />;
    }
    const sessions = result.data ? serializeData(result.data) : [];

    return <MobileOpnameListClient sessions={sessions as never} />;
}
