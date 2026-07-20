import { describe, expect, it } from 'vitest';
import {
  getWorkspaceFromPath,
  canAccessWorkspace,
  getDefaultRedirectForUser,
  hasWorkspaceResourceAccess,
  isPathAllowedByResources,
  getPreferredWorkspaceLanding,
} from '../access-policy';

describe('Access Policy Helpers', () => {
  describe('getWorkspaceFromPath', () => {
    it('correctly identifies valid workspace paths', () => {
      expect(getWorkspaceFromPath('/dashboard')).toBe('dashboard');
      expect(getWorkspaceFromPath('/warehouse/inventory')).toBe('warehouse');
      expect(getWorkspaceFromPath('/production/orders/123')).toBe('production');
      expect(getWorkspaceFromPath('/finance/tax')).toBe('finance');
      expect(getWorkspaceFromPath('/sales')).toBe('sales');
      expect(getWorkspaceFromPath('/hrd/attendance')).toBe('hrd');
      expect(getWorkspaceFromPath('/maklon/receipts')).toBe('maklon');
      expect(getWorkspaceFromPath('/admin/users')).toBe('admin');
    });

    it('returns null for invalid or public paths', () => {
      expect(getWorkspaceFromPath('/')).toBeNull();
      expect(getWorkspaceFromPath('/login')).toBeNull();
      expect(getWorkspaceFromPath('/about')).toBeNull();
      expect(getWorkspaceFromPath('/kiosk/terminal')).toBeNull();
    });
  });

  describe('hasWorkspaceResourceAccess / isPathAllowedByResources', () => {
    it('detects module root and nested grants', () => {
      expect(hasWorkspaceResourceAccess(['/warehouse'], 'warehouse')).toBe(true);
      expect(hasWorkspaceResourceAccess(['/warehouse/inventory'], 'warehouse')).toBe(true);
      expect(hasWorkspaceResourceAccess(['/sales'], 'warehouse')).toBe(false);
      expect(hasWorkspaceResourceAccess('ALL', 'warehouse')).toBe(true);
    });

    it('allows parent resource to cover children', () => {
      expect(isPathAllowedByResources('/warehouse/inventory', ['/warehouse'])).toBe(true);
      expect(isPathAllowedByResources('/warehouse/inventory/transfer', ['/warehouse'])).toBe(true);
    });

    it('allows workspace root when only nested resource is granted', () => {
      expect(isPathAllowedByResources('/warehouse', ['/warehouse/inventory'])).toBe(true);
    });

    it('denies sibling paths under same workspace', () => {
      expect(isPathAllowedByResources('/warehouse/opname', ['/warehouse/inventory'])).toBe(false);
    });
  });

  describe('getPreferredWorkspaceLanding', () => {
    it('prefers inventory when only inventory is granted', () => {
      expect(
        getPreferredWorkspaceLanding('warehouse', ['/warehouse/inventory']),
      ).toBe('/warehouse/inventory');
    });

    it('returns root when module root is granted', () => {
      expect(getPreferredWorkspaceLanding('warehouse', ['/warehouse'])).toBe(
        '/warehouse',
      );
    });
  });

  describe('canAccessWorkspace', () => {
    it('allows Super Admin only in admin workspace', () => {
      const superAdmin = { role: 'ADMIN', isSuperAdmin: true };
      expect(canAccessWorkspace(superAdmin, 'admin')).toBe(true);
      expect(canAccessWorkspace(superAdmin, 'dashboard')).toBe(false);
      expect(canAccessWorkspace(superAdmin, 'warehouse')).toBe(false);
    });

    it('denies tenant users from accessing admin workspace', () => {
      const tenantAdmin = { role: 'ADMIN', isSuperAdmin: false };
      const financeUser = { role: 'FINANCE', isSuperAdmin: false };
      expect(canAccessWorkspace(tenantAdmin, 'admin')).toBe(false);
      expect(canAccessWorkspace(financeUser, 'admin')).toBe(false);
    });

    it('allows Tenant Admin in any tenant workspace', () => {
      const tenantAdmin = { role: 'ADMIN', isSuperAdmin: false };
      expect(canAccessWorkspace(tenantAdmin, 'dashboard')).toBe(true);
      expect(canAccessWorkspace(tenantAdmin, 'warehouse')).toBe(true);
      expect(canAccessWorkspace(tenantAdmin, 'production')).toBe(true);
      expect(canAccessWorkspace(tenantAdmin, 'finance')).toBe(true);
    });

    it('strictly isolates Warehouse users to the warehouse workspace unless allowed via database resource permission', () => {
      const warehouseUser = { role: 'WAREHOUSE', allowedResources: ['/dashboard/products'] };
      expect(canAccessWorkspace(warehouseUser, 'warehouse')).toBe(true);
      expect(canAccessWorkspace(warehouseUser, 'production')).toBe(false);
      expect(canAccessWorkspace(warehouseUser, 'dashboard', '/dashboard/products')).toBe(true);
      expect(canAccessWorkspace(warehouseUser, 'dashboard', '/dashboard/products/create')).toBe(true);
      expect(canAccessWorkspace(warehouseUser, 'dashboard', '/dashboard/boms')).toBe(false);
    });

    it('strictly isolates Production users to the production workspace unless allowed via database resource permission', () => {
      const productionUser = { role: 'PRODUCTION', allowedResources: ['/dashboard/machines'] };
      expect(canAccessWorkspace(productionUser, 'production')).toBe(true);
      expect(canAccessWorkspace(productionUser, 'warehouse')).toBe(false);
      expect(canAccessWorkspace(productionUser, 'dashboard', '/dashboard/machines')).toBe(true);
      expect(canAccessWorkspace(productionUser, 'dashboard', '/dashboard/machines/create')).toBe(true);
      expect(canAccessWorkspace(productionUser, 'dashboard', '/dashboard/boms')).toBe(false);
    });


    it('allows Finance users in finance, hrd, and dashboard', () => {
      const financeUser = { role: 'FINANCE' };
      expect(canAccessWorkspace(financeUser, 'finance')).toBe(true);
      expect(canAccessWorkspace(financeUser, 'hrd')).toBe(true);
      expect(canAccessWorkspace(financeUser, 'dashboard')).toBe(true);
      expect(canAccessWorkspace(financeUser, 'warehouse')).toBe(false);
    });

    it('denies Sales users from hrd workspace', () => {
      const salesUser = { role: 'SALES' };
      expect(canAccessWorkspace(salesUser, 'hrd')).toBe(false);
    });

    it('allows Procurement and Planning in maklon workspace', () => {
      expect(canAccessWorkspace({ role: 'PROCUREMENT' }, 'maklon')).toBe(true);
      expect(canAccessWorkspace({ role: 'PLANNING' }, 'maklon')).toBe(true);
      expect(canAccessWorkspace({ role: 'ADMIN' }, 'maklon')).toBe(true);
      expect(canAccessWorkspace({ role: 'SALES' }, 'maklon')).toBe(false);
    });

    it('allows Sales users in sales and dashboard', () => {
      const salesUser = { role: 'SALES' };
      expect(canAccessWorkspace(salesUser, 'sales')).toBe(true);
      expect(canAccessWorkspace(salesUser, 'dashboard')).toBe(true);
      expect(canAccessWorkspace(salesUser, 'finance')).toBe(false);
    });

    it('allows Sales users into warehouse when Access Control grants /warehouse', () => {
      const salesUser = {
        role: 'SALES',
        allowedResources: ['/dashboard', '/sales', '/warehouse'],
      };
      // Layout gate (no pathname) must not bounce them
      expect(canAccessWorkspace(salesUser, 'warehouse')).toBe(true);
      expect(canAccessWorkspace(salesUser, 'warehouse', '/warehouse')).toBe(true);
      expect(
        canAccessWorkspace(salesUser, 'warehouse', '/warehouse/inventory'),
      ).toBe(true);
      // Still denied for unrelated workspaces
      expect(canAccessWorkspace(salesUser, 'finance')).toBe(false);
    });

    it('allows Sales users into warehouse when only /warehouse/inventory is granted', () => {
      const salesUser = {
        role: 'SALES',
        allowedResources: ['/warehouse/inventory'],
      };
      expect(canAccessWorkspace(salesUser, 'warehouse')).toBe(true);
      expect(canAccessWorkspace(salesUser, 'warehouse', '/warehouse')).toBe(true);
      expect(
        canAccessWorkspace(salesUser, 'warehouse', '/warehouse/inventory'),
      ).toBe(true);
      expect(
        canAccessWorkspace(salesUser, 'warehouse', '/warehouse/opname'),
      ).toBe(false);
    });

    it('returns false for null or undefined user', () => {
      expect(canAccessWorkspace(null, 'dashboard')).toBe(false);
      expect(canAccessWorkspace(undefined, 'dashboard')).toBe(false);
    });

    it('allows access if any of the assigned roles matches the policy', () => {
      const user = { role: 'PRODUCTION', roles: ['PRODUCTION', 'PLANNING'] };
      expect(canAccessWorkspace(user, 'production')).toBe(true);
      expect(canAccessWorkspace(user, 'warehouse')).toBe(true);
      expect(canAccessWorkspace(user, 'purchasing')).toBe(true);
    });

    it('denies access if none of the assigned roles match', () => {
      const user = { role: 'PRODUCTION', roles: ['PRODUCTION'] };
      expect(canAccessWorkspace(user, 'production')).toBe(true);
      expect(canAccessWorkspace(user, 'purchasing')).toBe(false);
      expect(canAccessWorkspace(user, 'finance')).toBe(false);
    });

    it('allows access to multiple workspaces for user with multiple matching roles', () => {
      const user = { role: 'SALES', roles: ['SALES', 'FINANCE'] };
      expect(canAccessWorkspace(user, 'sales')).toBe(true);
      expect(canAccessWorkspace(user, 'finance')).toBe(true);
      expect(canAccessWorkspace(user, 'production')).toBe(false);
    });

    it('denies access to unauthorized workspace for single role user', () => {
      const user = { role: 'WAREHOUSE', roles: ['WAREHOUSE'] };
      expect(canAccessWorkspace(user, 'warehouse')).toBe(true);
      expect(canAccessWorkspace(user, 'sales')).toBe(false);
    });
  });

  describe('getDefaultRedirectForUser', () => {
    it('returns correct redirect target per role', () => {
      expect(getDefaultRedirectForUser({ role: 'ADMIN', isSuperAdmin: true })).toBe('/super-admin');
      expect(getDefaultRedirectForUser({ role: 'WAREHOUSE' })).toBe('/warehouse');
      expect(getDefaultRedirectForUser({ role: 'PRODUCTION' })).toBe('/production');
      expect(getDefaultRedirectForUser({ role: 'FINANCE' })).toBe('/dashboard');
      expect(getDefaultRedirectForUser({ role: 'ADMIN', isSuperAdmin: false })).toBe('/dashboard');
    });
  });
});
