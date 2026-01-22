export function computeMaterialTotals(plannedMaterials: Array<{ quantity: number | string }>|undefined, materialIssues: Array<{ quantity: number | string }>|undefined) {
    let plannedTotal = 0;
    let issuedTotal = 0;

    if (Array.isArray(plannedMaterials)) {
        for (const m of plannedMaterials) {
            plannedTotal += Number(m?.quantity || 0);
        }
    }

    if (Array.isArray(materialIssues)) {
        for (const mi of materialIssues) {
            issuedTotal += Number(mi?.quantity || 0);
        }
    }

    const issuedPct = plannedTotal > 0 ? (issuedTotal / plannedTotal) * 100 : 0;

    return { plannedTotal, issuedTotal, issuedPct };
}

export default computeMaterialTotals;
