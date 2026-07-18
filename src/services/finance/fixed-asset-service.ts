import { prisma } from '@/lib/core/prisma';
import { ReferenceType, AssetStatus, JournalStatus } from '@prisma/client';
import { CreateJournalEntryInput } from '@/services/accounting/types';
import { createJournalEntry, postJournal } from '@/services/accounting/journals-service';
import { resolveAccount, type AccountRole } from '@/services/accounting/account-resolver';
import { resolveAccountCode } from '@/services/accounting/account-mapping-policy';
import { BusinessRuleError } from '@/lib/errors/errors';
import { toBusinessDateString, normalizeToBusinessDay, businessDateToEntryDate } from '@/lib/utils/timezone';

/** Map AssetCategory → resolver roles for asset account, depreciation, accumulated depreciation */
const ASSET_CATEGORY_ROLES: Record<string, { assetRole: string; deprRole: string; accumRole: string; defaultLifeMonths: number }> = {
  MACHINERY: { assetRole: 'fixed-asset-machinery', deprRole: 'depreciation-expense', accumRole: 'accumulated-depreciation', defaultLifeMonths: 60 },
  VEHICLE:   { assetRole: 'fixed-asset-vehicles',   deprRole: 'depreciation-expense', accumRole: 'accumulated-depreciation', defaultLifeMonths: 48 },
  BUILDING:  { assetRole: 'fixed-asset-buildings',  deprRole: 'depreciation-expense', accumRole: 'accumulated-depreciation', defaultLifeMonths: 240 },
  EQUIPMENT: { assetRole: 'fixed-asset-equipment',  deprRole: 'depreciation-expense', accumRole: 'accumulated-depreciation', defaultLifeMonths: 60 },
  OTHER:     { assetRole: 'fixed-asset-machinery',  deprRole: 'depreciation-expense', accumRole: 'accumulated-depreciation', defaultLifeMonths: 60 },
};

export class FixedAssetService {
    /**
     * Get all fixed assets
     */
    static async getAssets() {
        return await prisma.fixedAsset.findMany({
            include: {
                assetAccount: { select: { name: true, code: true } },
                accumDepreciationAccount: { select: { name: true, code: true } },
                depreciationExpenseAccount: { select: { name: true, code: true } },
            },
            orderBy: { purchaseDate: 'desc' }
        });
    }

    /**
     * Create FixedAsset from Goods Receipt (non-stock path).
     * Called inside a transaction from receipts-service.
     */
    static async createFromGoodsReceipt(params: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tx: any; // Prisma.TransactionClient
        productVariantId: string;
        purchaseOrderId?: string | null;
        goodsReceiptId: string;
        purchaseOrderItemId?: string | null;
        receivedQty: number;
        unitCost: number;
        receivedDate: Date;
        locationId: string;
        userId: string;
    }) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = params.tx as any; // Prisma.TransactionClient

        // Reject non-integer qty
        if (!Number.isInteger(params.receivedQty) || params.receivedQty < 1) {
            throw new BusinessRuleError('Qty aset tetap harus bilangan bulat ≥ 1');
        }

        const variant = await tx.productVariant.findUnique({
            where: { id: params.productVariantId },
            include: { product: true },
        });
        if (!variant) throw new BusinessRuleError(`Product variant not found: ${params.productVariantId}`);

        const product = variant.product;
        const category = (product as Record<string, unknown>).assetCategory as string || 'OTHER';
        const catConfig = ASSET_CATEGORY_ROLES[category] || ASSET_CATEGORY_ROLES['OTHER'];

        // Enforce inventoryAccountId for FIXED_ASSET
        if (!product.inventoryAccountId) {
            throw new BusinessRuleError(
                `Produk aset tetap "${product.name}" belum punya Akun Aset Tetap. ` +
                `Silakan edit produk → pilih Akun Aset Tetap (category FIXED_ASSET) di master.`,
            );
        }

        // Resolve accounts
        const assetAccountId = product.inventoryAccountId;
        const deprAccountId = (await resolveAccount(catConfig.deprRole as AccountRole)).id;
        const accumAccountId = (await resolveAccount(catConfig.accumRole as AccountRole)).id;

        // Resolve AP account — align with inventory GR path (trade-payable role)
        const apAccountCode = await resolveAccountCode(product.productType, 'trade-payable');
        const apAccountId = (await tx.account.findFirst({
            where: { code: apAccountCode.code },
        }))?.id;
        if (!apAccountId) throw new BusinessRuleError(`Akun Trade Payable tidak ditemukan: ${apAccountCode.code}`);

        const qty = params.receivedQty;

        // Generate asset codes — in-memory seq to avoid collision within tx
        // Query existing codes for today from tx (sees uncommitted creates)
        const wibDate = toBusinessDateString(params.receivedDate); // YYYYMMDD in WIB
        const prefix = `AST-${wibDate}-`;
        const lastRow = await tx.fixedAsset.findFirst({
            where: { assetCode: { startsWith: prefix } },
            orderBy: { assetCode: 'desc' },
            select: { assetCode: true },
        });
        let seq = lastRow ? parseInt(lastRow.assetCode.replace(prefix, ''), 10) + 1 : 1;

        // Useful life: variant.attributes.usefulLifeMonths (we store custom here since Product has no attributes) → product.attributes (future) → category default → 60
        const variantAttrs = (variant as unknown as { attributes?: Record<string, unknown> | null })?.attributes as Record<string, unknown> | null | undefined;
        const productAttrs = (product as unknown as { attributes?: Record<string, unknown> | null })?.attributes as Record<string, unknown> | null | undefined;
        const fromVariant = variantAttrs?.usefulLifeMonths != null ? Number(variantAttrs.usefulLifeMonths) : null;
        const fromProduct = productAttrs?.usefulLifeMonths != null ? Number(productAttrs.usefulLifeMonths) : null;
        const customLife = fromVariant ?? fromProduct;
        const usefulLifeMonths = (customLife && customLife > 0) ? customLife : catConfig.defaultLifeMonths;

        const createdAssets: string[] = [];

        for (let i = 1; i <= qty; i++) {
            const assetCode = `${prefix}${seq.toString().padStart(3, '0')}`;
            seq++;
            const assetName = qty > 1 ? `${product.name} #${i}` : product.name;

            const asset = await tx.fixedAsset.create({
                data: {
                    assetCode,
                    name: assetName,
                    category, // label: "MACHINERY", "VEHICLE", etc.
                    purchaseDate: params.receivedDate,
                    purchaseValue: params.unitCost,
                    usefulLifeMonths,
                    assetAccountId,
                    depreciationAccountId: deprAccountId,
                    accumulatedDepreciationAccountId: accumAccountId,
                    status: AssetStatus.ACTIVE,
                    locationId: params.locationId,
                    productVariantId: params.productVariantId,
                    purchaseOrderId: params.purchaseOrderId || null,
                    goodsReceiptId: params.goodsReceiptId,
                    purchaseOrderItemId: params.purchaseOrderItemId || null,
                },
            });
            createdAssets.push(asset.id);
        }

        // Journal: Dr Asset Account / Cr Trade Payable — inside same tx
        const totalAmount = params.unitCost * qty;

        await createJournalEntry({
            entryDate: normalizeToBusinessDay(params.receivedDate),
            description: `GR Pembelian Aset Tetap - ${product.name} (x${qty})`,
            reference: `GR-${params.goodsReceiptId.slice(0, 8)}`,
            referenceType: ReferenceType.GOODS_RECEIPT,
            referenceId: params.goodsReceiptId,
            isAutoGenerated: true,
            status: JournalStatus.POSTED,
            lines: [
                { accountId: assetAccountId, debit: totalAmount, credit: 0, description: `Aset Tetap: ${product.name}` },
                { accountId: apAccountId, debit: 0, credit: totalAmount, description: `Trade Payable: ${product.name}` },
            ],
        } as unknown as CreateJournalEntryInput, tx);

        return createdAssets;
    }

    /**
     * Create a new fixed asset
     */
    static async createAsset(data: {
        assetCode: string;
        name: string;
        category: string;
        purchaseDate: Date;
        purchaseValue: number;
        usefulLifeMonths: number;
        assetAccountId: string;
        depreciationAccountId: string;
        accumulatedDepreciationAccountId: string;
    }) {
        return await prisma.fixedAsset.create({
            data: {
                ...data,
                scrapValue: 0,
                status: AssetStatus.ACTIVE
            }
        });
    }

    /**
     * Run monthly depreciation for all active assets
     */
    static async runDepreciation(year: number, month: number, userId: string) {
        // WIB start-of-month instant for the "already depreciated this month" guard.
        const firstDayOfMonth = businessDateToEntryDate(
            `${year}-${String(month).padStart(2, '0')}-01`,
        );
        const now = new Date();

        // Find all active assets that haven't been depreciated this month
        const assetsToDepreciate = await prisma.fixedAsset.findMany({
            where: {
                status: AssetStatus.ACTIVE,
                OR: [
                    { lastDepreciationDate: null },
                    { lastDepreciationDate: { lt: firstDayOfMonth } }
                ]
            }
        });

        if (assetsToDepreciate.length === 0) {
            return [];
        }

        const journalEntriesProcessed: string[] = [];

        await prisma.$transaction(async (tx) => {
            for (const asset of assetsToDepreciate) {
                // Determine monthly depreciation amount
                // Formula: (Purchase Value - Scrap Value) / Useful Life Months
                const purchaseValue = asset.purchaseValue.toNumber();
                const scrapValue = asset.scrapValue.toNumber();
                const monthlyDepreciation = (purchaseValue - scrapValue) / asset.usefulLifeMonths;

                if (monthlyDepreciation <= 0) continue; // Already fully depreciated or invalid

                const journalData: CreateJournalEntryInput = {
                    entryDate: normalizeToBusinessDay(new Date()),
                    description: `Monthly Depreciation for Asset: ${asset.assetCode} - ${asset.name}`,
                    reference: asset.assetCode,
                    referenceType: ReferenceType.MANUAL_ENTRY,
                    referenceId: asset.id,
                    lines: [
                        {
                            accountId: asset.depreciationAccountId,
                            debit: monthlyDepreciation,
                            credit: 0
                        },
                        {
                            accountId: asset.accumulatedDepreciationAccountId,
                            debit: 0,
                            credit: monthlyDepreciation
                        }
                    ],
                    userId: userId // Add createdById equivalent handled inside
                } as unknown as CreateJournalEntryInput; 
                // Using "as any" since earlier we set it to createdById but we might have missed mapping it.
                // Wait, in previous step I changed it to `createdById` internally, let's use createdById directly.

                journalData.createdById = userId;

                const journal = await createJournalEntry(journalData, tx);
                await postJournal(journal.id, userId, tx);

                // Update asset
                await tx.fixedAsset.update({
                    where: { id: asset.id },
                    data: { lastDepreciationDate: now }
                });

                journalEntriesProcessed.push(journal.id);
            }
        });

        return journalEntriesProcessed;
    }
}
