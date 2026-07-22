import { describe, expect, it } from 'vitest';
import {
  PERMISSION_CATALOG,
  flattenCatalog,
  getModuleRoot,
  getFeatureCatalog,
} from '../permission-catalog';

describe('permission-catalog', () => {
  it('flattens the tree into a unique, non-empty key list', () => {
    const flat = flattenCatalog();
    const keys = flat.map((n) => n.key);
    expect(keys.length).toBeGreaterThan(50);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes core module roots from the plan catalog', () => {
    const roots = PERMISSION_CATALOG.map((n) => n.key);
    expect(roots).toEqual(
      expect.arrayContaining([
        '/dashboard',
        '/sales',
        '/purchasing',
        '/production',
        '/warehouse',
        '/finance',
        '/hrd',
        '/maklon',
      ]),
    );
  });

  it('nests warehouse inventory sub-permissions under /warehouse/inventory', () => {
    const warehouse = PERMISSION_CATALOG.find((n) => n.key === '/warehouse');
    const inventory = warehouse?.children?.find((n) => n.key === '/warehouse/inventory');
    expect(inventory?.children?.map((n) => n.key)).toEqual(
      expect.arrayContaining([
        '/warehouse/inventory/transfer',
        '/warehouse/inventory/adjustment',
        '/warehouse/inventory/aging',
        '/warehouse/inventory/history',
      ]),
    );
  });

  it('includes warehouse materials path for command-board split', () => {
    const warehouse = PERMISSION_CATALOG.find((n) => n.key === '/warehouse');
    const keys = warehouse?.children?.map((n) => n.key) ?? [];
    expect(keys).toContain('/warehouse/materials');
  });

  describe('getModuleRoot', () => {
    it('extracts the first path segment', () => {
      expect(getModuleRoot('/warehouse/inventory/transfer')).toBe('/warehouse');
      expect(getModuleRoot('/sales')).toBe('/sales');
      expect(getModuleRoot('')).toBeNull();
    });
  });

  describe('getFeatureCatalog', () => {
    it('includes view-prices as a feature flag', () => {
      expect(getFeatureCatalog().map((f) => f.key)).toContain('feature:view-prices');
    });
  });
});
