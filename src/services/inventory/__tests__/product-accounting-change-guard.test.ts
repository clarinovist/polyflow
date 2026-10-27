import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { guardProductAccountingChange, type ProductAccountingChange } from '../product-accounting-change-guard';

const basis = vi.hoisted(() => vi.fn());
vi.mock('../internal-usage-accounting', () => ({ skuInventoryBasis: basis }));

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const db = {
    productVariant: { findMany: vi.fn() },
    stockMovement: { count: vi.fn() },
    inventory: { count: vi.fn(), aggregate: vi.fn() },
    account: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
};
const tx = db as unknown as Prisma.TransactionClient;
const change = (extra: Partial<ProductAccountingChange> = {}): ProductAccountingChange => ({
    productId: 'p', fromType: 'RAW_MATERIAL', toType: 'OPERATIONAL', fromAccountId: null, toAccountId: null,
    userId: 'u', role: 'FINANCE', reason: 'Koreksi klasifikasi ATK sesuai Finance', ...extra,
});

describe('guardProductAccountingChange', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.productVariant.findMany.mockResolvedValue([{ id: 'v1' }]);
        db.stockMovement.count.mockResolvedValue(1);
        db.inventory.count.mockResolvedValue(1);
        db.inventory.aggregate.mockResolvedValue({ _sum: { quantity: d(10) } });
        basis.mockResolvedValue(new Map([['acc-131', d(40000)]]));
        db.account.findMany.mockResolvedValue([{ id: 'acc-131', code: '1-131' }]);
    });

    it('does nothing when neither type nor account changes', async () => {
        await guardProductAccountingChange(tx, change({ toType: 'RAW_MATERIAL' }));
        expect(db.productVariant.findMany).not.toHaveBeenCalled();
    });

    it('lets anyone reclassify a product with no stock or history', async () => {
        db.stockMovement.count.mockResolvedValue(0);
        db.inventory.count.mockResolvedValue(0);
        await guardProductAccountingChange(tx, change({ role: 'WAREHOUSE', reason: null }));
        expect(db.auditLog.create).not.toHaveBeenCalled();
    });

    it('restricts a stocked product to Finance/Admin and shows the SKU basis impact', async () => {
        await expect(guardProductAccountingChange(tx, change({ role: 'WAREHOUSE' }))).rejects.toMatchObject({
            code: 'PRODUCT_ACCOUNTING_CHANGE_RESTRICTED',
            message: expect.stringContaining('stok 10; nilai buku SKU 1-131 Rp40000.00'),
        });
        expect(db.auditLog.create).not.toHaveBeenCalled();
    });

    it('requires a reason from Finance', async () => {
        await expect(guardProductAccountingChange(tx, change({ reason: ' singkat ' }))).rejects.toMatchObject({
            code: 'PRODUCT_ACCOUNTING_CHANGE_REASON_REQUIRED',
        });
    });

    it('audits the change with its before/after and SKU basis inside the transaction', async () => {
        await guardProductAccountingChange(tx, change({ role: 'ADMIN', fromAccountId: 'acc-131', toAccountId: 'acc-134' }));
        expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
            action: 'CHANGE_PRODUCT_ACCOUNTING', entityId: 'p', fromStatus: 'RAW_MATERIAL', toStatus: 'OPERATIONAL',
            details: 'Koreksi klasifikasi ATK sesuai Finance',
            changes: JSON.stringify({ fromAccountId: 'acc-131', toAccountId: 'acc-134', stockQuantity: '10',
                skuBasis: [{ account: '1-131', value: '40000.00' }] }),
        }) });
    });
});
