import { getOpnameSessions } from '@/actions/inventory/opname';
import { serializeData } from '@/lib/utils/utils';
import { MobileOpnameListClient } from './MobileOpnameListClient';

export default async function MobileOpnameListPage() {
    const result = await getOpnameSessions();
    const sessions = result.success && result.data ? serializeData(result.data) : [];

    return <MobileOpnameListClient sessions={sessions as never} />;
}
