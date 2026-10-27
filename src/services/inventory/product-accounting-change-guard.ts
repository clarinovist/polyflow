import { Prisma, type ProductType } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { skuInventoryBasis } from './internal-usage-accounting';

const ACCOUNTING_CHANGE_ROLES = new Set(['ADMIN', 'FINANCE']);
const MIN_REASON_LENGTH = 10;

export interface ProductAccountingChange {
    productId: string;
    fromType: ProductType;
    toType: ProductType;
    fromAccountId: string | null;
    toAccountId: string | null;
    userId: string;
    role?: string | null;
    reason?: string | null;
}

async function describeImpact(tx: Prisma.TransactionClient, variantIds: string[]) {
    const stock = await tx.inventory.aggregate({
        where: { productVariantId: { in: variantIds } }, _sum: { quantity: true },
    });
    const basis = new Map<string, Prisma.Decimal>();
    for (const id of variantIds) {
        for (const [accountId, value] of await skuInventoryBasis(tx, id)) {
            basis.set(accountId, (basis.get(accountId) ?? new Prisma.Decimal(0)).plus(value));
        }
    }
    const accounts = await tx.account.findMany({ where: { id: { in: [...basis.keys()] } }, select: { id: true, code: true } });
    const values = accounts.map((account) => ({ account: account.code, value: basis.get(account.id)!.toFixed(2) }));
    const quantity = (stock._sum.quantity ?? new Prisma.Decimal(0)).toString();
    const text = `stok ${quantity}; nilai buku SKU ${values.length ? values.map((v) => `${v.account} Rp${v.value}`).join(', ') : 'tidak ada'}`;
    return { quantity, values, text };
}

/**
 * A stocked product's type and inventory account decide which account later
 * receipts debit and internal usage credits. Changing them silently splits a
 * SKU's value across accounts, so only Finance/Admin may do it, with a reason,
 * and the current SKU basis is audited inside the caller's transaction.
 */
export async function guardProductAccountingChange(tx: Prisma.TransactionClient, change: ProductAccountingChange) {
    if (change.fromType === change.toType && change.fromAccountId === change.toAccountId) return;
    const variants = await tx.productVariant.findMany({ where: { productId: change.productId }, select: { id: true } });
    const variantIds = variants.map((variant) => variant.id);
    const hasHistory = variantIds.length > 0 && (
        (await tx.stockMovement.count({ where: { productVariantId: { in: variantIds } } })) > 0 ||
        (await tx.inventory.count({ where: { productVariantId: { in: variantIds }, quantity: { not: 0 } } })) > 0
    );
    if (!hasHistory) return;
    const impact = await describeImpact(tx, variantIds);
    if (!change.role || !ACCOUNTING_CHANGE_ROLES.has(change.role)) {
        throw new BusinessRuleError(
            `Produk ini sudah punya stok/riwayat (${impact.text}). Jenis barang atau akun persediaannya hanya dapat diubah oleh Finance/Admin.`,
            { productId: change.productId }, 'PRODUCT_ACCOUNTING_CHANGE_RESTRICTED',
        );
    }
    const reason = change.reason?.trim() ?? '';
    if (reason.length < MIN_REASON_LENGTH) {
        throw new BusinessRuleError(
            `Isi alasan perubahan (min. ${MIN_REASON_LENGTH} karakter). Dampak: ${impact.text}. Penerimaan dan pemakaian berikutnya mengikuti akun jenis/akun baru; nilai lama tetap di akun asal sampai Finance mereklasifikasinya.`,
            { productId: change.productId }, 'PRODUCT_ACCOUNTING_CHANGE_REASON_REQUIRED',
        );
    }
    await logActivity({
        userId: change.userId, action: 'CHANGE_PRODUCT_ACCOUNTING', entityType: 'Product', entityId: change.productId,
        details: reason, fromStatus: change.fromType, toStatus: change.toType,
        changes: { fromAccountId: change.fromAccountId, toAccountId: change.toAccountId,
            stockQuantity: impact.quantity, skuBasis: impact.values },
        tx,
    });
}
