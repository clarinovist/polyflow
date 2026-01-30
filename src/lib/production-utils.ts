// Utility functions for production and costing logic

/**
 * Calculates the total cost of a BOM based on its items.
 * Formula: Sum(unitCost * quantity * (1 + scrapPercentage/100))
 * 
 * @param items Array of BOM items with productVariant (containing standardCost or buyPrice), quantity, and scrapPercentage
 * @returns Total calculated cost
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function calculateBomCost(items: any[]): number {
    return items.reduce((acc, item) => {
        const variant = item.productVariant;
        if (!variant) return acc;

        const unitCost = Number(variant.standardCost ?? variant.buyPrice ?? 0);
        const quantity = Number(item.quantity ?? 0);
        const scrapAndWaste = 1 + (Number(item.scrapPercentage ?? 0) / 100);

        return acc + (unitCost * quantity * scrapAndWaste);
    }, 0);
}
