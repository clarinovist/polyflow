import { describe, expect, it } from 'vitest';
import { canSeeNavHref, filterNavItems, filterNavGroups } from '../permission-match';

describe('canSeeNavHref', () => {
  it('shows everything when permissions are undefined or ALL', () => {
    expect(canSeeNavHref('/warehouse/opname', undefined)).toBe(true);
    expect(canSeeNavHref('/warehouse/opname', 'ALL')).toBe(true);
  });

  it('module root grant shows every link under that module', () => {
    expect(canSeeNavHref('/warehouse/opname', ['/warehouse'])).toBe(true);
    expect(canSeeNavHref('/warehouse', ['/warehouse'])).toBe(true);
  });

  it('exact/nested resource grants show matching links', () => {
    expect(canSeeNavHref('/warehouse/inventory', ['/warehouse/inventory'])).toBe(true);
    expect(canSeeNavHref('/warehouse/inventory/transfer', ['/warehouse/inventory'])).toBe(true);
  });

  it('parent nav stays visible when only a nested resource is granted', () => {
    expect(canSeeNavHref('/warehouse/inventory', ['/warehouse/inventory/transfer'])).toBe(true);
  });

  it('denies sibling links under the same module', () => {
    expect(canSeeNavHref('/warehouse/opname', ['/warehouse/inventory'])).toBe(false);
  });

  it('denies links from unrelated modules', () => {
    expect(canSeeNavHref('/sales/invoices', ['/warehouse/inventory'])).toBe(false);
  });
});

describe('filterNavItems / filterNavGroups', () => {
  const items = [
    { href: '/warehouse', children: [
      { href: '/warehouse/opname' },
      { href: '/warehouse/inventory', children: [
        { href: '/warehouse/inventory/transfer' },
      ] },
    ] },
  ];

  it('passes through unfiltered when ALL', () => {
    expect(filterNavItems(items, 'ALL')).toEqual(items);
  });

  it('keeps only granted leaves and their visible parents', () => {
    const filtered = filterNavItems(items, ['/warehouse/inventory']);
    expect(filtered).toHaveLength(1);
    const warehouseNode = filtered[0];
    expect(warehouseNode.children?.map((c) => c.href)).toEqual(['/warehouse/inventory']);
  });

  it('drops the whole group when no items are visible', () => {
    const groups = [{ heading: 'Persediaan', items: [{ href: '/warehouse/opname' }] }];
    expect(filterNavGroups(groups, ['/sales'])).toEqual([]);
  });
});
