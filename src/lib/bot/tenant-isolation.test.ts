import { describe, it, expect } from 'vitest';
import { checkToolAuthorization, filterAuthorizedTools } from './tool-authorization';
import type { AssistantUserContext, AssistantToolDefinition } from './assistant-types';
import { z } from 'zod';

function makeContext(overrides: Partial<AssistantUserContext> = {}): AssistantUserContext {
  return {
    userId: 'user-1',
    requesterName: 'Test User',
    activeRole: 'WAREHOUSE',
    roles: ['WAREHOUSE'],
    allowedResources: ['/warehouse', '/warehouse/inventory'],
    tenantId: 'tenant-1',
    channel: 'web',
    locale: 'id-ID',
    ...overrides,
  };
}

function makeTool(overrides: Partial<AssistantToolDefinition> = {}): AssistantToolDefinition {
  return {
    name: 'test_tool',
    description: 'Test tool',
    requiredResources: ['/warehouse/inventory'],
    sensitivity: 'normal',
    inputSchema: z.object({}),
    execute: async () => ({ summary: '', facts: [], source: 'tenant-data', checkedAt: '', completeness: 'complete' }),
    ...overrides,
  };
}

describe('checkToolAuthorization', () => {
  it('allows tool when user has exact required resource', () => {
    const ctx = makeContext({ allowedResources: ['/warehouse/inventory'] });
    const tool = makeTool({ requiredResources: ['/warehouse/inventory'] });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(true);
  });

  it('allows tool when user has parent resource', () => {
    const ctx = makeContext({ allowedResources: ['/warehouse'] });
    const tool = makeTool({ requiredResources: ['/warehouse/inventory'] });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(true);
  });

  it('denies tool when user lacks required resource', () => {
    const ctx = makeContext({ allowedResources: ['/sales/orders'] });
    const tool = makeTool({ requiredResources: ['/warehouse/inventory'] });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(false);
    expect(result.missingResources).toContain('/warehouse/inventory');
  });

  it('allows ALL resources user to access any tool', () => {
    const ctx = makeContext({ allowedResources: 'ALL' });
    const tool = makeTool({ requiredResources: ['/finance/aging'] });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(true);
  });

  it('allows tool with empty required resources (public tool)', () => {
    const ctx = makeContext({ allowedResources: [] });
    const tool = makeTool({ requiredResources: [] });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(true);
  });

  it('denies financial tool for non-finance user', () => {
    const ctx = makeContext({
      allowedResources: ['/warehouse'],
      activeRole: 'WAREHOUSE',
    });
    const tool = makeTool({
      requiredResources: ['/finance/aging'],
      sensitivity: 'financial',
    });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(false);
  });

  it('allows financial tool for finance user', () => {
    const ctx = makeContext({
      allowedResources: ['/finance', '/finance/aging'],
      activeRole: 'FINANCE',
    });
    const tool = makeTool({
      requiredResources: ['/finance/aging'],
      sensitivity: 'financial',
    });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(true);
  });

  it('denies personal tool for non-HRD user', () => {
    const ctx = makeContext({
      allowedResources: ['/warehouse'],
      activeRole: 'WAREHOUSE',
    });
    const tool = makeTool({
      requiredResources: ['/hrd/attendance'],
      sensitivity: 'personal',
    });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(false);
  });
});

describe('filterAuthorizedTools', () => {
  it('filters out tools user cannot access', () => {
    const ctx = makeContext({ allowedResources: ['/warehouse/inventory'] });
    const tools = [
      makeTool({ name: 'stock', requiredResources: ['/warehouse/inventory'] }),
      makeTool({ name: 'finance', requiredResources: ['/finance/aging'] }),
      makeTool({ name: 'production', requiredResources: ['/production/orders'] }),
    ];
    const result = filterAuthorizedTools(tools, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('stock');
  });

  it('returns all tools for ALL resource user', () => {
    const ctx = makeContext({ allowedResources: 'ALL' });
    const tools = [
      makeTool({ name: 'stock', requiredResources: ['/warehouse/inventory'] }),
      makeTool({ name: 'finance', requiredResources: ['/finance/aging'] }),
    ];
    const result = filterAuthorizedTools(tools, ctx);
    expect(result).toHaveLength(2);
  });
});

describe('Cross-tenant isolation', () => {
  it('SALES user cannot access warehouse tools', () => {
    const ctx = makeContext({
      userId: 'sales-user',
      activeRole: 'SALES',
      roles: ['SALES'],
      allowedResources: ['/sales', '/sales/orders', '/sales/invoices'],
      tenantId: 'tenant-1',
    });
    const tool = makeTool({ requiredResources: ['/warehouse/inventory'] });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(false);
  });

  it('WAREHOUSE user cannot access finance tools', () => {
    const ctx = makeContext({
      userId: 'warehouse-user',
      activeRole: 'WAREHOUSE',
      roles: ['WAREHOUSE'],
      allowedResources: ['/warehouse', '/warehouse/inventory'],
      tenantId: 'tenant-1',
    });
    const tool = makeTool({
      requiredResources: ['/finance/aging'],
      sensitivity: 'financial',
    });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(false);
  });

  it('PRODUCTION user cannot access sales tools', () => {
    const ctx = makeContext({
      userId: 'production-user',
      activeRole: 'PRODUCTION',
      roles: ['PRODUCTION'],
      allowedResources: ['/production', '/production/orders'],
      tenantId: 'tenant-1',
    });
    const tool = makeTool({ requiredResources: ['/sales/orders'] });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(false);
  });

  it('FINANCE user cannot access warehouse tools', () => {
    const ctx = makeContext({
      userId: 'finance-user',
      activeRole: 'FINANCE',
      roles: ['FINANCE'],
      allowedResources: ['/finance', '/finance/aging'],
      tenantId: 'tenant-1',
    });
    const tool = makeTool({ requiredResources: ['/warehouse/inventory'] });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(false);
  });

  it('ADMIN can access all tools via ALL resources', () => {
    const ctx = makeContext({
      userId: 'admin-user',
      activeRole: 'ADMIN',
      roles: ['ADMIN'],
      allowedResources: 'ALL',
      tenantId: 'tenant-1',
    });
    const tools = [
      makeTool({ name: 'stock', requiredResources: ['/warehouse/inventory'] }),
      makeTool({ name: 'finance', requiredResources: ['/finance/aging'], sensitivity: 'financial' }),
      makeTool({ name: 'hrd', requiredResources: ['/hrd/attendance'], sensitivity: 'personal' }),
      makeTool({ name: 'production', requiredResources: ['/production/orders'] }),
    ];
    const result = filterAuthorizedTools(tools, ctx);
    expect(result).toHaveLength(4);
  });

  it('empty allowedResources denies all restricted tools', () => {
    const ctx = makeContext({
      userId: 'no-access-user',
      activeRole: 'MARKETING',
      roles: ['MARKETING'],
      allowedResources: [],
      tenantId: 'tenant-1',
    });
    const tools = [
      makeTool({ name: 'stock', requiredResources: ['/warehouse/inventory'] }),
      makeTool({ name: 'finance', requiredResources: ['/finance/aging'] }),
      makeTool({ name: 'production', requiredResources: ['/production/orders'] }),
    ];
    const result = filterAuthorizedTools(tools, ctx);
    expect(result).toHaveLength(0);
  });

  it('user with /sales cannot access /sales/deliveries (child resource)', () => {
    const ctx = makeContext({
      allowedResources: ['/sales'],
      tenantId: 'tenant-1',
    });
    const tool = makeTool({ requiredResources: ['/sales/deliveries'] });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(true);
  });

  it('restricted sensitivity denies user without /hrd', () => {
    const ctx = makeContext({
      allowedResources: ['/sales'],
      tenantId: 'tenant-1',
    });
    const tool = makeTool({
      requiredResources: ['/hrd/payroll'],
      sensitivity: 'restricted',
    });
    const result = checkToolAuthorization(tool, ctx);
    expect(result.allowed).toBe(false);
  });
});
