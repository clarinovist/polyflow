import { getMaklonDashboard } from '@/actions/maklon/maklon-dashboard';
import { MaklonDashboard } from '@/components/maklon/MaklonDashboard';
import { isNextControlFlowError } from '@/lib/errors/errors';

export const dynamic = 'force-dynamic';

export default async function MaklonDashboardPage() {
    let result: Awaited<ReturnType<typeof getMaklonDashboard>> | null = null;
    try {
        result = await getMaklonDashboard();
    } catch (error) {
        if (isNextControlFlowError(error)) throw error;
    }

    return (
        <MaklonDashboard
            data={result?.success && result.data ? result.data : null}
        />
    );
}
