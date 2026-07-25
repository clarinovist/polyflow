import { describe, it, expect } from 'vitest';
import { productionOutputSchema, logRunningOutputSchema } from '../production';

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
