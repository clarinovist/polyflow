import { describe, it, expect } from 'vitest';
import { NAV_REGISTRY, findDuplicateHrefs } from '../registry';

describe('Navigation Registry', () => {
  it('should have no duplicate hrefs within any single portal', () => {
    const duplicates = findDuplicateHrefs();
    if (duplicates.length > 0) {
      const details = duplicates
        .map(
          ({ href, items }) =>
            `  ${href}: ${items.map((i) => `${i.id} (${i.label})`).join(', ')}`,
        )
        .join('\n');
      expect.fail(
        `Found duplicate hrefs within the same portal:\n${details}`,
      );
    }
  });

  it('should have unique IDs across all nav items', () => {
    const ids = NAV_REGISTRY.map((item) => item.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have non-empty hrefs for all items', () => {
    const emptyHrefs = NAV_REGISTRY.filter(
      (item) => !item.href || item.href.trim() === '',
    );
    expect(emptyHrefs).toHaveLength(0);
  });

  it('should have non-empty labels for all items', () => {
    const emptyLabels = NAV_REGISTRY.filter(
      (item) => !item.label || item.label.trim() === '',
    );
    expect(emptyLabels).toHaveLength(0);
  });

  it('should mark alias items with canonicalHref', () => {
    const aliasItems = NAV_REGISTRY.filter((item) => item.isAlias);
    for (const item of aliasItems) {
      expect(item.canonicalHref).toBeDefined();
      expect(item.canonicalHref).not.toBe('');
    }
  });

  it('should cover expected portals', () => {
    const workspaces = new Set(NAV_REGISTRY.map((item) => item.workspace));
    expect(workspaces.has('master')).toBe(true);
    expect(workspaces.has('sales')).toBe(true);
    expect(workspaces.has('production')).toBe(true);
    expect(workspaces.has('warehouse')).toBe(true);
    expect(workspaces.has('purchasing')).toBe(true);
  });
});
