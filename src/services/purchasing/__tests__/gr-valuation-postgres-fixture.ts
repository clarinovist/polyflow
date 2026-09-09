import { PrismaClient } from '@prisma/client';

export const GR_VALUATION_TEST_DATABASE = 'polyflow_gr_valuation_test';

export function grValuationTestConfig() {
    const connection = process.env.GR_VALUATION_TEST_DATABASE_URL;
    if (!connection) return null;
    let url: URL;
    try {
        url = new URL(connection);
    } catch {
        throw new Error(
            'GR valuation tests require a valid GR_VALUATION_TEST_DATABASE_URL',
        );
    }
    const loopbackHosts = new Set([
        '127.0.0.1',
        '::1',
        '::ffff:127.0.0.1',
        'localhost',
    ]);
    if (!loopbackHosts.has(url.hostname)) {
        throw new Error(
            'GR valuation tests require a loopback GR_VALUATION_TEST_DATABASE_URL',
        );
    }
    if (!url.port) {
        throw new Error(
            'GR valuation tests require an explicit port in GR_VALUATION_TEST_DATABASE_URL',
        );
    }
    if (url.pathname !== `/${GR_VALUATION_TEST_DATABASE}`) {
        throw new Error(
            `GR valuation tests require database ${GR_VALUATION_TEST_DATABASE}`,
        );
    }
    return { connection };
}

/** Null when the isolated PG env is absent so ordinary CI safely skips. */
export function grValuationTestClient(): PrismaClient | null {
    const config = grValuationTestConfig();
    if (!config) return null;
    return new PrismaClient({
        datasources: { db: { url: config.connection } },
    });
}

export function requireGrValuationTestClient(): PrismaClient {
    const db = grValuationTestClient();
    if (!db) {
        throw new Error(
            'GR_VALUATION_TEST_DATABASE_URL is required for GR valuation tests',
        );
    }
    return db;
}

export const syntheticCase = {
    receivedQty: 1500,
    grossUnitPrice: '29748',
    netUnitCost: '26800',
    taxPercent: '11',
    ppnMode: 'INCLUDE' as const,
    grNetTotal: '40200000',
    invoiceNetSubtotal: '40200000',
    invoiceVat: '4422000',
    invoiceTotal: '44622000',
};

export const accounts = {
    inventory: { id: '11111111-1111-4111-8111-111111111111', code: '1-130' },
    clearing: { id: '22222222-2222-4222-8222-222222222222', code: '2-115' },
    vat: { id: '33333333-3333-4333-8333-333333333333', code: '21320' },
    payable: { id: '44444444-4444-4433-8444-444444444444', code: '21110' },
} as const;

export async function resetGrValuationDatabase(db: PrismaClient) {
    const [identity] = await db.$queryRaw<
        { name: string }[]
    >`SELECT current_database() name`;
    if (identity.name !== GR_VALUATION_TEST_DATABASE) {
        throw new Error('Disposable GR valuation database required');
    }
    await db.$executeRaw`TRUNCATE "AuditLog", "JournalLine", "JournalEntry", "CostHistory", "StockMovement", "Inventory", "GoodsReceiptItem", "GoodsReceipt", "PurchaseOrderItem", "PurchaseOrder", "PurchaseInvoice", "FixedAsset", "Supplier", "ProductVariant", "Product", "Location", "Customer", "Account", "FiscalPeriod", "SystemSequence", "User" CASCADE`;
}

export async function seedGrValuationBaseline(db: PrismaClient) {
    await resetGrValuationDatabase(db);
    const receivedDate = new Date('2026-09-08T02:00:00.000Z');
    await db.user.create({
        data: {
            id: 'gr-valuation-actor',
            email: 'gr-valuation@example.invalid',
            password: 'test-password',
            role: 'WAREHOUSE',
        },
    });
    await db.account.createMany({
        data: [
            {
                id: accounts.inventory.id,
                code: accounts.inventory.code,
                name: 'Persediaan Bahan Baku GR',
                type: 'ASSET',
                category: 'CURRENT_ASSET',
            },
            {
                id: accounts.clearing.id,
                code: accounts.clearing.code,
                name: 'GR/IR clearing',
                type: 'LIABILITY',
                category: 'CURRENT_LIABILITY',
            },
            {
                id: accounts.vat.id,
                code: accounts.vat.code,
                name: 'PPN Masukan GR',
                type: 'ASSET',
                category: 'CURRENT_ASSET',
            },
            {
                id: accounts.payable.id,
                code: accounts.payable.code,
                name: 'Hutang Dagang GR',
                type: 'LIABILITY',
                category: 'CURRENT_LIABILITY',
            },
        ],
    });
    await db.product.create({
        data: {
            id: 'gr-product',
            name: 'Synthetic GR product',
            productType: 'RAW_MATERIAL',
            inventoryAccountId: accounts.inventory.id,
        },
    });
    await db.productVariant.create({
        data: {
            id: 'gr-variant',
            productId: 'gr-product',
            name: 'Synthetic GR variant',
            skuCode: 'GR-NET-0128',
            primaryUnit: 'PCS',
        },
    });
    await db.productVariant.create({
        data: {
            id: 'gr-variant-b',
            productId: 'gr-product',
            name: 'Synthetic GR variant B',
            skuCode: 'GR-NET-0128-B',
            primaryUnit: 'PCS',
        },
    });
    await db.location.create({
        data: {
            id: 'gr-location',
            name: 'GR valuation warehouse',
            slug: 'gr-valuation-fixture',
        },
    });
    await db.location.create({
        data: {
            id: 'gr-location-b',
            name: 'GR valuation warehouse B',
            slug: 'gr-valuation-fixture-b',
        },
    });
    await db.supplier.create({
        data: { id: 'gr-supplier', name: 'GR valuation supplier' },
    });
    await db.purchaseOrder.create({
        data: {
            id: 'gr-po',
            orderNumber: 'PO-GR-NET-0128',
            supplierId: 'gr-supplier',
            status: 'SENT',
            totalAmount: syntheticCase.invoiceTotal,
            taxAmount: syntheticCase.invoiceVat,
            items: {
                create: {
                    id: 'gr-po-item',
                    productVariantId: 'gr-variant',
                    quantity: syntheticCase.receivedQty,
                    unitPrice: syntheticCase.grossUnitPrice,
                    subtotal: syntheticCase.invoiceTotal,
                    discountPercent: 0,
                    taxPercent: syntheticCase.taxPercent,
                    taxAmount: syntheticCase.invoiceVat,
                    ppnMode: syntheticCase.ppnMode,
                    receivedQty: 0,
                },
            },
        },
    });
    await db.fiscalPeriod.create({
        data: {
            id: 'gr-period',
            name: 'GR valuation September 2026',
            year: 2026,
            month: 9,
            startDate: new Date('2026-08-31T17:00:00.000Z'),
            endDate: new Date('2026-09-30T16:59:59.999Z'),
            status: 'OPEN',
        },
    });
    await db.systemSequence.create({
        data: { key: 'JOURNAL_ENTRY_2026', value: BigInt(1000) },
    });
    return { receivedDate };
}
