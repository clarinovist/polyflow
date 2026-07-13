import { describe, expect, it } from 'vitest';
import {
  getWorkspaceFromPath,
  canAccessWorkspace,
  getDefaultRedirectForUser,
} from '../access-policy';

describe('Access Policy Helpers', () => {
  describe('getWorkspaceFromPath', () => {
    it('correctly identifies valid workspace paths', () => {
      expect(getWorkspaceFromPath('/dashboard')).toBe('dashboard');
      expect(getWorkspaceFromPath('/warehouse/inventory')).toBe('warehouse');
      expect(getWorkspaceFromPath('/production/orders/123')).toBe('production');
      expect(getWorkspaceFromPath('/finance/tax')).toBe('finance');
      expect(getWorkspaceFromPath('/sales')).toBe('sales');
      expect(getWorkspaceFromPath('/admin/users')).toBe('admin');
    });

    it('returns null for invalid or public paths', () => {
      expect(getWorkspaceFromPath('/')).toBeNull();
      expect(getWorkspaceFromPath('/login')).toBeNull();
      expect(getWorkspaceFromPath('/about')).toBeNull();
      expect(getWorkspaceFromPath('/kiosk/terminal')).toBeNull();
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


    it('allows Finance users in finance and dashboard', () => {
      const financeUser = { role: 'FINANCE' };
      expect(canAccessWorkspace(financeUser, 'finance')).toBe(true);
      expect(canAccessWorkspace(financeUser, 'dashboard')).toBe(true);
      expect(canAccessWorkspace(financeUser, 'warehouse')).toBe(false);
    });

    it('allows Sales users in sales and dashboard', () => {
      const salesUser = { role: 'SALES' };
      expect(canAccessWorkspace(salesUser, 'sales')).toBe(true);
      expect(canAccessWorkspace(salesUser, 'dashboard')).toBe(true);
      expect(canAccessWorkspace(salesUser, 'finance')).toBe(false);
    });

    it('returns false for null or undefined user', () => {
      expect(canAccessWorkspace(null, 'dashboard')).toBe(false);
      expect(canAccessWorkspace(undefined, 'dashboard')).toBe(false);
    });
  });

  describe('getDefaultRedirectForUser', () => {
    it('returns correct redirect target per role', () => {
      expect(getDefaultRedirectForUser({ role: 'ADMIN', isSuperAdmin: true })).toBe('/admin/super-admin');
      expect(getDefaultRedirectForUser({ role: 'WAREHOUSE' })).toBe('/warehouse');
      expect(getDefaultRedirectForUser({ role: 'PRODUCTION' })).toBe('/production');
      expect(getDefaultRedirectForUser({ role: 'FINANCE' })).toBe('/dashboard');
      expect(getDefaultRedirectForUser({ role: 'ADMIN', isSuperAdmin: false })).toBe('/dashboard');
    });
  });
});
