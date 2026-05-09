import { describe, expect, it } from 'vitest';

import {
    formatCostGapLabel,
    getCostAlertMessage,
    getCostHealthTone,
    getCostSourceLabel,
    getCostSourceTone,
} from './cost-diagnostics';

describe('cost diagnostics ui helpers', () => {
    it('should map cost sources to readable labels and tones', () => {
        expect(getCostSourceLabel('inventory_average')).toBe('Inventory Avg');
        expect(getCostSourceTone('inventory_average')).toBe('default');
        expect(getCostSourceLabel('standard_cost')).toBe('Standard Cost');
        expect(getCostSourceTone('standard_cost')).toBe('secondary');
    });

    it('should format positive and negative gap labels', () => {
        expect(formatCostGapLabel(33000, 15000)).toBe('+120.0% vs std');
        expect(formatCostGapLabel(15000, 30000)).toBe('-50.0% vs std');
        expect(formatCostGapLabel(15000, 0)).toBe(null);
    });

    it('should return readable anomaly messages', () => {
        expect(getCostAlertMessage('low_stock_cost_outlier')).toContain('stok tipis');
        expect(getCostAlertMessage('inventory_standard_gap')).toContain('berbeda jauh');
    });

    it('should mark destructive tone when anomaly flags exist', () => {
        expect(getCostHealthTone([])).toBe('secondary');
        expect(getCostHealthTone(['inventory_standard_gap'])).toBe('destructive');
    });
});
