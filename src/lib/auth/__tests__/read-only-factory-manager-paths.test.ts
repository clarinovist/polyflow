import { describe, expect, it } from 'vitest';
import { isPathDeniedForReadOnlyFactoryManager } from '../read-only-factory-manager-paths';
import { isPathDeniedForReadOnlyFactoryManager as reExported } from '../access-policy';

describe('isPathDeniedForReadOnlyFactoryManager (pure module)', () => {
  it('is re-exported unchanged from access-policy', () => {
    expect(reExported).toBe(isPathDeniedForReadOnlyFactoryManager);
  });

  it.each([
    '/dashboard/products',
    '/warehouse/inventory/adjustment',
    '/warehouse/inventory/transfer/x',
    '/purchasing/orders/create',
    '/purchasing/orders/abc/edit',
    '/purchasing/orders/abc/edit/',
  ])('denies %s', (path) => {
    expect(isPathDeniedForReadOnlyFactoryManager(path)).toBe(true);
  });

  it.each([
    '/dashboard',
    '/dashboard/',
    '/dashboardx',
    '/production/daily',
    '/warehouse/inventory',
    '/warehouse/inventory/adjustmentx',
    '/purchasing/orders',
    '/purchasing/orders/3f2b8c1e-0a4d-4c8e-9d3a-6b1f2e7a9c10',
    '/',
  ])('allows %s', (path) => {
    expect(isPathDeniedForReadOnlyFactoryManager(path)).toBe(false);
  });

  it.each([
    '/purchasing/orders/%63reate',
    '/purchasing/orders/abc/%65dit',
    '/warehouse/inventory/%61djustment',
    '/dashboard/%65mployees',
    '//dashboard/employees',
    '/Dashboard/Employees',
    '/dashboard//employees',
    '/purchasing/orders/%2563reate',
    '/dashboard%2Femployees',
    '/PURCHASING/ORDERS/ABC/EDIT',
  ])('denies the encoded/normalised bypass %s', (path) => {
    expect(isPathDeniedForReadOnlyFactoryManager(path)).toBe(true);
  });

  it('fails closed when percent-encoding is malformed', () => {
    expect(isPathDeniedForReadOnlyFactoryManager('/production/daily/%')).toBe(true);
    expect(isPathDeniedForReadOnlyFactoryManager('/x/%E0%A4%A')).toBe(true);
  });

  it('fails closed when the path is still encoded after two decode rounds', () => {
    expect(isPathDeniedForReadOnlyFactoryManager('/purchasing/orders/%252563reate')).toBe(true);
  });

  it('does not confuse a decoded look-alike with a denied route', () => {
    expect(isPathDeniedForReadOnlyFactoryManager('/purchasing/orders/%63reatex')).toBe(false);
  });
});
