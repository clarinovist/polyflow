import { describe, expect, it } from 'vitest';
import {
    isInventoryThresholdTriggered,
    isLowStockAlertLocation,
    sumInventoryAlertQuantity,
} from '../locations';

const dec = (value: number) => ({ toNumber: () => value });

describe('canonical inventory alert location scope', () => {
    it('accepts only INTERNAL raw-material and finished-good locations', () => {
        expect(isLowStockAlertLocation({ locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' })).toBe(true);
        expect(isLowStockAlertLocation({ locationType: 'INTERNAL', locationPurpose: 'FINISHED_GOOD' })).toBe(true);
        expect(isLowStockAlertLocation({ locationType: 'INTERNAL', locationPurpose: 'WIP' })).toBe(false);
        expect(isLowStockAlertLocation({ locationType: 'INTERNAL', locationPurpose: 'SCRAP' })).toBe(false);
        expect(isLowStockAlertLocation({ locationType: 'CUSTOMER_OWNED', locationPurpose: 'RAW_MATERIAL' })).toBe(false);
        expect(isLowStockAlertLocation(null)).toBe(false);
    });

    it('sums Decimal-like and numeric quantities only in eligible locations', () => {
        const inventories = [
            { quantity: dec(2), location: { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' } },
            { quantity: 3, location: { locationType: 'INTERNAL', locationPurpose: 'FINISHED_GOOD' } },
            { quantity: dec(100), location: { locationType: 'INTERNAL', locationPurpose: 'WIP' } },
            { quantity: dec(200), location: { locationType: 'CUSTOMER_OWNED', locationPurpose: 'RAW_MATERIAL' } },
        ];
        expect(sumInventoryAlertQuantity(inventories)).toBe(5);
        expect(isInventoryThresholdTriggered(inventories, dec(10))).toBe(true);
        expect(isInventoryThresholdTriggered(inventories, dec(5))).toBe(false);
    });

    it('requires a positive configured threshold', () => {
        const inventories = [
            { quantity: -2, location: { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' } },
        ];
        expect(isInventoryThresholdTriggered(inventories, null)).toBe(false);
        expect(isInventoryThresholdTriggered(inventories, 0)).toBe(false);
    });
});
