import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FixedAssetService } from '../fixed-asset-service';

vi.mock('@/lib/core/prisma', () => ({
  prisma: {
    fixedAsset: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    account: { findFirst: vi.fn() },
  },
}));

vi.mock('@/services/accounting/journals-service', () => ({
  createJournalEntry: vi.fn(),
  postJournal: vi.fn(),
}));

vi.mock('@/services/accounting/account-resolver', () => ({
  resolveAccount: vi.fn(),
}));

vi.mock('@/services/accounting/account-mapping-policy', () => ({
  resolveAccountCode: vi.fn(),
}));

import { createJournalEntry } from '@/services/accounting/journals-service';
import { resolveAccount } from '@/services/accounting/account-resolver';
import { resolveAccountCode } from '@/services/accounting/account-mapping-policy';

/**
 * Build a mocked Prisma transaction client for createFromGoodsReceipt.
 * `variantAttributes` / `productAttributes` let tests exercise the
 * useful-life resolution precedence.
 */
function buildTx(opts: {
  productName?: string;
  assetCategory?: string;
  inventoryAccountId?: string | null;
  variantAttributes?: Record<string, unknown> | null;
  productAttributes?: Record<string, unknown> | null;
  existingLastCode?: string | null;
}) {
  const {
    productName = 'Mesin Tali Rafia',
    assetCategory = 'MACHINERY',
    inventoryAccountId = 'acc-asset',
    variantAttributes = null,
    productAttributes = null,
    existingLastCode = null,
  } = opts;

  const created: Array<Record<string, unknown>> = [];

  const tx = {
    productVariant: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'variant-1',
        attributes: variantAttributes,
        product: {
          name: productName,
          assetCategory,
          inventoryAccountId,
          productType: 'FIXED_ASSET',
          attributes: productAttributes,
        },
      }),
    },
    account: {
      findFirst: vi.fn().mockResolvedValue({ id: 'acc-ap' }),
    },
    fixedAsset: {
      findFirst: vi
        .fn()
        .mockResolvedValue(existingLastCode ? { assetCode: existingLastCode } : null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `asset-${created.length + 1}`, ...data };
        created.push(row);
        return Promise.resolve(row);
      }),
    },
  };

  return { tx, created };
}

const baseParams = {
  productVariantId: 'variant-1',
  purchaseOrderId: 'po-1',
  goodsReceiptId: 'gr-abcdef12',
  purchaseOrderItemId: 'poi-1',
  unitCost: 25_000_000,
  receivedDate: new Date('2026-07-02T00:00:00+07:00'), // 2 Jul WIB
  locationId: 'loc-1',
  userId: 'user-1',
};

describe('FixedAssetService.createFromGoodsReceipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAccount).mockResolvedValue({ id: 'acc-resolved' } as never);
    vi.mocked(resolveAccountCode).mockResolvedValue({ code: '21100' } as never);
    vi.mocked(createJournalEntry).mockResolvedValue({ id: 'je-1' } as never);
  });

  it('creates exactly N assets for qty N with #i suffixed names', async () => {
    const { tx, created } = buildTx({});

    const ids = await FixedAssetService.createFromGoodsReceipt({
      ...baseParams,
      tx: tx as never,
      receivedQty: 3,
    });

    expect(ids).toHaveLength(3);
    expect(tx.fixedAsset.create).toHaveBeenCalledTimes(3);
    expect(created.map((a) => a.name)).toEqual([
      'Mesin Tali Rafia #1',
      'Mesin Tali Rafia #2',
      'Mesin Tali Rafia #3',
    ]);
    // Sequential asset codes for the same WIB day (AST-YYYY-MM-DD-NNN)
    expect(created.map((a) => a.assetCode)).toEqual([
      'AST-2026-07-02-001',
      'AST-2026-07-02-002',
      'AST-2026-07-02-003',
    ]);
  });

  it('uses the bare product name (no suffix) when qty is 1', async () => {
    const { tx, created } = buildTx({});

    await FixedAssetService.createFromGoodsReceipt({
      ...baseParams,
      tx: tx as never,
      receivedQty: 1,
    });

    expect(created).toHaveLength(1);
    expect(created[0].name).toBe('Mesin Tali Rafia');
  });

  it('posts a single Dr Asset / Cr AP journal for the total (unitCost * qty)', async () => {
    const { tx } = buildTx({});

    await FixedAssetService.createFromGoodsReceipt({
      ...baseParams,
      tx: tx as never,
      receivedQty: 2,
    });

    expect(createJournalEntry).toHaveBeenCalledTimes(1);
    const je = vi.mocked(createJournalEntry).mock.calls[0][0] as never as {
      entryDate: Date;
      lines: { accountId: string; debit: number; credit: number }[];
    };
    const total = 25_000_000 * 2;
    const debit = je.lines.find((l) => l.debit > 0)!;
    const credit = je.lines.find((l) => l.credit > 0)!;
    expect(debit.debit).toBe(total);
    expect(credit.credit).toBe(total);
    // entryDate anchored to the WIB business day of receivedDate (2 Jul WIB)
    expect(je.entryDate.toISOString()).toBe('2026-07-01T17:00:00.000Z');
  });

  it('applies custom useful life from variant.attributes.usefulLifeMonths', async () => {
    const { tx, created } = buildTx({ variantAttributes: { usefulLifeMonths: 120 } });

    await FixedAssetService.createFromGoodsReceipt({
      ...baseParams,
      tx: tx as never,
      receivedQty: 1,
    });

    expect(created[0].usefulLifeMonths).toBe(120);
  });

  it('falls back to product.attributes.usefulLifeMonths when variant has none', async () => {
    const { tx, created } = buildTx({ productAttributes: { usefulLifeMonths: 84 } });

    await FixedAssetService.createFromGoodsReceipt({
      ...baseParams,
      tx: tx as never,
      receivedQty: 1,
    });

    expect(created[0].usefulLifeMonths).toBe(84);
  });

  it('falls back to the category default (MACHINERY = 60) when no custom life given', async () => {
    const { tx, created } = buildTx({});

    await FixedAssetService.createFromGoodsReceipt({
      ...baseParams,
      tx: tx as never,
      receivedQty: 1,
    });

    expect(created[0].usefulLifeMonths).toBe(60);
  });

  it('continues the daily asset-code sequence from the last existing code', async () => {
    const { tx, created } = buildTx({ existingLastCode: 'AST-2026-07-02-005' });

    await FixedAssetService.createFromGoodsReceipt({
      ...baseParams,
      tx: tx as never,
      receivedQty: 2,
    });

    expect(created.map((a) => a.assetCode)).toEqual([
      'AST-2026-07-02-006',
      'AST-2026-07-02-007',
    ]);
  });

  it('rejects a non-integer qty', async () => {
    const { tx } = buildTx({});
    await expect(
      FixedAssetService.createFromGoodsReceipt({
        ...baseParams,
        tx: tx as never,
        receivedQty: 1.5,
      }),
    ).rejects.toThrow(/bilangan bulat/);
  });

  it('rejects a FIXED_ASSET product without an asset account', async () => {
    const { tx } = buildTx({ inventoryAccountId: null });
    await expect(
      FixedAssetService.createFromGoodsReceipt({
        ...baseParams,
        tx: tx as never,
        receivedQty: 1,
      }),
    ).rejects.toThrow(/Akun Aset Tetap/);
  });
});
