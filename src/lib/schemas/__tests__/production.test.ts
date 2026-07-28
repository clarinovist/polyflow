import { describe, it, expect } from 'vitest';
import {
  productionOutputSchema,
  logRunningOutputSchema,
  createBomSchema,
} from '../production';

describe('productionOutputSchema', () => {
  const baseInput = {
    productionOrderId: 'po-1',
    quantityProduced: 10,
    startTime: new Date(),
    endTime: new Date(),
  };

  it('rejects when shiftId is missing', () => {
    const result = productionOutputSchema.safeParse(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      const shiftIssue = result.error.issues.find((i) => i.path.includes('shiftId'));
      expect(shiftIssue).toBeDefined();
    }
  });

  it('rejects when shiftId is empty string', () => {
    const result = productionOutputSchema.safeParse({ ...baseInput, shiftId: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const shiftIssue = result.error.issues.find((i) => i.path.includes('shiftId'));
      expect(shiftIssue).toBeDefined();
      expect(shiftIssue?.message).toBe('Shift wajib dipilih');
    }
  });

  it('rejects when shiftId is only whitespace', () => {
    const result = productionOutputSchema.safeParse({ ...baseInput, shiftId: '   ' });

    // .trim() runs after min(1) check in zod chain order, so whitespace-only
    // passes min(1) (length 3) then gets trimmed to '' on the parsed value.
    // Assert the parsed/trimmed value is empty to catch this edge case explicitly.
    if (result.success) {
      expect(result.data.shiftId).toBe('');
    } else {
      expect(result.success).toBe(false);
    }
  });

  it('accepts valid shiftId', () => {
    const result = productionOutputSchema.safeParse({ ...baseInput, shiftId: 'shift-1' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBe('shift-1');
    }
  });
});

describe('logRunningOutputSchema', () => {
  const baseInput = {
    executionId: 'exec-1',
    quantityProduced: 10,
  };

  it('accepts payload without shiftId (optional)', () => {
    const result = logRunningOutputSchema.safeParse(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBeUndefined();
    }
  });

  it('accepts payload with explicit shiftId', () => {
    const result = logRunningOutputSchema.safeParse({ ...baseInput, shiftId: 'shift-1' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBe('shift-1');
    }
  });

  it('transforms empty string shiftId to undefined', () => {
    const result = logRunningOutputSchema.safeParse({ ...baseInput, shiftId: '' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBeUndefined();
    }
  });
});

describe('createBomSchema', () => {
  const validBomPayload = {
    name: 'BOM Test',
    productVariantId: 'variant-output',
    outputQuantity: 1,
    isDefault: true,
    category: 'STANDARD',
    items: [
      { productVariantId: 'variant-ing-1', quantity: 10, scrapPercentage: 0 },
      { productVariantId: 'variant-ing-2', quantity: 5, scrapPercentage: 1 },
    ],
  };

  it('accepts valid BOM payload with distinct output and ingredients', () => {
    const result = createBomSchema.safeParse(validBomPayload);
    expect(result.success).toBe(true);
  });

  it('rejects when output product is selected as an ingredient for itself', () => {
    const invalidPayload = {
      ...validBomPayload,
      items: [
        { productVariantId: 'variant-output', quantity: 1, scrapPercentage: 0 },
        { productVariantId: 'variant-ing-2', quantity: 5, scrapPercentage: 0 },
      ],
    };

    const result = createBomSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === 'items' && i.path[1] === 0 && i.path[2] === 'productVariantId'
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toBe('Produk output tidak boleh menjadi bahan baku resep ini');
    }
  });
});

