import { getHppCalculatorData } from '@/actions/finance/hpp-calculator';

import HppCalculatorClient from './HppCalculatorClient';

export const dynamic = 'force-dynamic';

export default async function HppCalculatorPage() {
    const result = await getHppCalculatorData();

    if (!result.success) {
        throw new Error(result.error);
    }

    return <HppCalculatorClient initialData={result.data ?? { boms: [] }} />;
}
