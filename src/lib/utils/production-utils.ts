import { calculateBomItemCost } from './current-cost';

// Utility functions for production and costing logic

/**
 * Calculates the total cost of a BOM based on its items.
 * Formula: Sum(unitCost * quantity * (1 + scrapPercentage/100))
 *
 * @param items Array of BOM items with productVariant (containing standardCost or buyPrice), quantity, and scrapPercentage
 * @returns Total calculated cost
 */
type BomCostItem = Parameters<typeof calculateBomItemCost>[0];

export function calculateBomCost(items: BomCostItem[]): number {
    return items.reduce((acc, item) => {
        return acc + calculateBomItemCost(item);
    }, 0);
}
