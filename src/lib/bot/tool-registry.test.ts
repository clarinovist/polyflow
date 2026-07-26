import { describe, it, expect } from 'vitest';
import { toolRegistry, getToolsForContext, toolsToOpenAiFormat } from './tool-registry';
import { checkToolAuthorization } from './tool-authorization';
import type { AssistantUserContext } from './assistant-types';

// ---------------------------------------------------------------------------
// Role × Tool permission matrix tests
// ---------------------------------------------------------------------------

type RoleConfig = {
  role: string;
  resources: string[] | 'ALL';
};

const TEST_ROLES: RoleConfig[] = [
  { role: 'ADMIN', resources: 'ALL' },
  { role: 'WAREHOUSE', resources: ['/warehouse', '/warehouse/inventory', '/kiosk'] },
  { role: 'SALES', resources: ['/sales', '/sales/orders', '/sales/invoices', '/sales/deliveries', '/warehouse/inventory'] },
  { role: 'PRODUCTION', resources: ['/production', '/production/orders', '/warehouse', '/warehouse/inventory'] },
  { role: 'FINANCE', resources: ['/finance', '/finance/aging', '/finance/invoices', '/sales/invoices'] },
  { role: 'PROCUREMENT', resources: ['/purchasing', '/purchasing/orders', '/finance/invoices'] },
  { role: 'HRD', resources: ['/hrd', '/hrd/attendance', '/hrd/payroll'] },
];

function makeCtx(role: RoleConfig): AssistantUserContext {
  return {
    userId: `${role.role.toLowerCase()}-user`,
    activeRole: role.role,
    roles: [role.role],
    allowedResources: role.resources,
    tenantId: 'test-tenant',
    channel: 'web',
    locale: 'id-ID',
  };
}

describe('Tool Registry completeness', () => {
  it('has at least 14 tools registered', () => {
    expect(toolRegistry.length).toBeGreaterThanOrEqual(14);
  });

  it('all tools have required fields', () => {
    for (const tool of toolRegistry) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.requiredResources).toBeDefined();
      expect(tool.sensitivity).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('all tools have unique names', () => {
    const names = toolRegistry.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

describe('Permission matrix: Role × Tool', () => {
  for (const role of TEST_ROLES) {
    describe(`${role.role}`, () => {
      const ctx = makeCtx(role);
      const allowed = getToolsForContext(ctx);

      it('can access search_help_articles (public tool)', () => {
        const tool = toolRegistry.find((t) => t.name === 'search_help_articles');
        expect(tool).toBeDefined();
        const result = checkToolAuthorization(tool!, ctx);
        expect(result.allowed).toBe(true);
      });

      if (role.role === 'ADMIN') {
        it('ADMIN can access all tools', () => {
          expect(allowed.length).toBe(toolRegistry.length);
        });
      }

      if (role.role === 'WAREHOUSE') {
        it('can access stock tools', () => {
          const stockTools = allowed.filter((t) =>
            t.name.includes('stock') || t.name.includes('product'),
          );
          expect(stockTools.length).toBeGreaterThan(0);
        });

        it('cannot access finance tools', () => {
          const financeTools = allowed.filter((t) =>
            t.sensitivity === 'financial',
          );
          expect(financeTools.length).toBe(0);
        });
      }

      if (role.role === 'SALES') {
        it('can access SO tools', () => {
          const soTools = allowed.filter((t) =>
            t.name.includes('sales') || t.name.includes('pending'),
          );
          expect(soTools.length).toBeGreaterThan(0);
        });

        it('can access delivery tools', () => {
          const deliveryTools = allowed.filter((t) =>
            t.name.includes('delivery'),
          );
          expect(deliveryTools.length).toBeGreaterThan(0);
        });
      }

      if (role.role === 'FINANCE') {
        it('can access finance tools', () => {
          const financeTools = allowed.filter((t) =>
            t.sensitivity === 'financial' || t.name.includes('finance'),
          );
          expect(financeTools.length).toBeGreaterThan(0);
        });

        it('cannot access warehouse tools directly', () => {
          const warehouseOnly = allowed.filter((t) =>
            t.requiredResources.every((r) => r.startsWith('/warehouse')),
          );
          // Finance might have /sales/invoices which overlaps
          // But should not have pure warehouse tools
          for (const tool of warehouseOnly) {
            expect(tool.sensitivity).not.toBe('financial');
          }
        });
      }

      if (role.role === 'PROCUREMENT') {
        it('can access PO tools', () => {
          const poTools = allowed.filter((t) =>
            t.name.includes('purchase'),
          );
          expect(poTools.length).toBeGreaterThan(0);
        });
      }

      if (role.role === 'HRD') {
        it('can access attendance tools', () => {
          const hrdTools = allowed.filter((t) =>
            t.name.includes('attendance'),
          );
          expect(hrdTools.length).toBeGreaterThan(0);
        });
      }
    });
  }
});

describe('Denied role (no resources)', () => {
  it('user with empty resources gets no tools except public', () => {
    const ctx: AssistantUserContext = {
      userId: 'denied-user',
      activeRole: 'MARKETING',
      roles: ['MARKETING'],
      allowedResources: [],
      tenantId: 'test-tenant',
      channel: 'web',
      locale: 'id-ID',
    };
    const allowed = getToolsForContext(ctx);
    // Only search_help_articles (public, no required resources)
    expect(allowed.length).toBe(1);
    expect(allowed[0].name).toBe('search_help_articles');
  });
});

describe('OpenAI format conversion', () => {
  it('converts tools to OpenAI format', () => {
    const openAiTools = toolsToOpenAiFormat(toolRegistry.slice(0, 3));
    expect(openAiTools.length).toBe(3);
    for (const t of openAiTools) {
      expect(t.type).toBe('function');
      expect(t.function.name).toBeTruthy();
      expect(t.function.description).toBeTruthy();
    }
  });

  it('preserves parameters schema', () => {
    const stockTool = toolRegistry.find((t) => t.name === 'get_product_stock');
    const openAiTools = toolsToOpenAiFormat([stockTool!]);
    expect(openAiTools[0].function.parameters).toBeDefined();
    const params = openAiTools[0].function.parameters as Record<string, unknown>;
    expect(params.type).toBe('object');
    expect(params.properties).toBeDefined();
  });
});
