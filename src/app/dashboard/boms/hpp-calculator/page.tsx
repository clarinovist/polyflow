import { getHppCalculatorData } from '@/actions/finance/hpp-calculator';
import HppCalculatorClient from '@/app/finance/costing/hpp-calculator/HppCalculatorClient';

export const dynamic = 'force-dynamic';

export default async function BomHppCalculatorPage() {
    const result = await getHppCalculatorData();

    if (!result.success) {
        throw new Error(result.error);
    }

    return (
        <HppCalculatorClient
            initialData={result.data ?? { boms: [] }}
            backHref="/dashboard/boms"
            backLabel="Back to BOMs"
        />
    );
}
