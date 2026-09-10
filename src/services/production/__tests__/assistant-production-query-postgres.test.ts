import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const connection = process.env.TEST_ASSISTANT_DATABASE_URL;
let db: import('@prisma/client').PrismaClient;

if (connection) {
    const url = new URL(connection);
    if (
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/polyflow_assistant_test'
    ) {
        throw new Error(
            'Only disposable localhost polyflow_assistant_test is allowed',
        );
    }
    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient({ datasources: { db: { url: connection } } });
}

import {
    diagnoseProductionOrder,
    getProductionBriefing,
} from '../assistant-production-query-service';

const userId = 'assistant-production-user';
const outputLocationId = 'assistant-output';
const sourceLocationId = 'assistant-source';
const scrapLocationId = 'assistant-scrap';
const productId = 'assistant-product';
const materialProductId = 'assistant-material-product';
const productVariantId = 'assistant-product-variant';
const materialVariantId = 'assistant-material-variant';
const bomId = 'assistant-bom';

async function seedBase() {
    await db.user.create({
        data: {
            id: userId,
            email: 'assistant-production@example.invalid',
            password: 'synthetic-only',
            role: 'PRODUCTION',
        },
    });
    await db.location.createMany({
        data: [
            {
                id: outputLocationId,
                name: 'Synthetic Output',
                slug: 'assistant-output',
                locationPurpose: 'FINISHED_GOOD',
            },
            {
                id: sourceLocationId,
                name: 'Synthetic Raw Material',
                slug: 'assistant-source',
                locationPurpose: 'RAW_MATERIAL',
            },
            {
                id: scrapLocationId,
                name: 'Synthetic Scrap',
                slug: 'assistant-scrap',
                locationPurpose: 'SCRAP',
            },
        ],
    });
    await db.product.createMany({
        data: [
            { id: productId, name: 'Synthetic Finished', productType: 'FINISHED_GOOD' },
            { id: materialProductId, name: 'Synthetic Resin', productType: 'RAW_MATERIAL' },
        ],
    });
    await db.productVariant.createMany({
        data: [
            {
                id: productVariantId,
                productId,
                name: 'Synthetic Finished Variant',
                skuCode: 'ASSISTANT-FG',
                primaryUnit: 'KG',
            },
            {
                id: materialVariantId,
                productId: materialProductId,
                name: 'Synthetic Resin Variant',
                skuCode: 'ASSISTANT-RM',
                primaryUnit: 'KG',
            },
        ],
    });
    await db.bom.create({
        data: {
            id: bomId,
            name: 'Synthetic BOM',
            productVariantId,
            outputQuantity: 100,
            category: 'STANDARD',
            items: {
                create: { productVariantId: materialVariantId, quantity: 50 },
            },
        },
    });
}

async function createOrder(input: {
    id: string;
    orderNumber: string;
    status?: 'DRAFT' | 'RELEASED' | 'IN_PROGRESS' | 'WAITING_MATERIAL';
    plannedEndDate?: Date | null;
    plannedQuantity?: number;
}) {
    return db.productionOrder.create({
        data: {
            id: input.id,
            orderNumber: input.orderNumber,
            bomId,
            locationId: outputLocationId,
            createdById: userId,
            plannedQuantity: input.plannedQuantity ?? 100,
            plannedStartDate: new Date('2026-09-01T00:00:00Z'),
            plannedEndDate: input.plannedEndDate,
            status: input.status ?? 'IN_PROGRESS',
            actualQuantity: 20,
        },
    });
}

// Opt-in only. This file refuses every host/database except the dedicated local DB.
describe.skipIf(!connection)(
    'assistant production query on disposable PostgreSQL',
    () => {
        beforeEach(async () => {
            expect(
                (
                    await db.$queryRaw<{ db: string }[]>`SELECT current_database() db`
                )[0].db,
            ).toBe('polyflow_assistant_test');
            await db.$executeRaw`TRUNCATE "ProductionIssue", "MaterialIssue", "ProductionMaterial", "ProductionOrder", "StockReservation", "Inventory", "BomItem", "Bom", "ProductVariant", "Product", "Machine", "Location", "User" CASCADE`;
            await seedBase();
        });

        afterAll(async () => {
            await db.$disconnect();
        });

        it('subtracts other reservations and staged material without counting scrap stock', async () => {
            await createOrder({ id: 'order-1', orderNumber: 'SPK-001' });
            await db.productionMaterial.create({
                data: {
                    productionOrderId: 'order-1',
                    productVariantId: materialVariantId,
                    sourceLocationId,
                    quantity: 50,
                },
            });
            await db.materialIssue.createMany({
                data: [
                    {
                        productionOrderId: 'order-1',
                        productVariantId: materialVariantId,
                        locationId: sourceLocationId,
                        quantity: 20,
                        status: 'ISSUED',
                    },
                    {
                        productionOrderId: 'order-1',
                        productVariantId: materialVariantId,
                        locationId: sourceLocationId,
                        quantity: 5,
                        status: 'STAGED',
                    },
                ],
            });
            await db.inventory.createMany({
                data: [
                    {
                        locationId: sourceLocationId,
                        productVariantId: materialVariantId,
                        quantity: 20,
                    },
                    {
                        locationId: scrapLocationId,
                        productVariantId: materialVariantId,
                        quantity: 100,
                    },
                ],
            });
            await db.stockReservation.createMany({
                data: [
                    {
                        productVariantId: materialVariantId,
                        locationId: sourceLocationId,
                        quantity: 5,
                        reservedFor: 'SALES_ORDER',
                        referenceId: 'another-order',
                    },
                    {
                        productVariantId: materialVariantId,
                        locationId: sourceLocationId,
                        quantity: 4,
                        reservedFor: 'PRODUCTION_ORDER',
                        referenceId: 'order-1',
                    },
                ],
            });

            const result = await db.$transaction((tx) =>
                diagnoseProductionOrder(tx, 'order-1'),
            );
            expect(result.order?.materials[0]).toMatchObject({
                required: 50,
                issued: 25,
                remaining: 25,
                available: 10,
                shortage: 15,
            });
        });

        it('keeps ambiguous numbers unresolved and produces a bounded briefing', async () => {
            for (let index = 0; index < 22; index++) {
                await createOrder({
                    id: `order-${index}`,
                    orderNumber: `SPK-SYN-${String(index).padStart(2, '0')}`,
                    plannedEndDate:
                        index === 21
                            ? null
                            : new Date(
                                  Date.UTC(2026, 8, 1 + (index % 10)),
                              ),
                });
            }

            const ambiguous = await db.$transaction((tx) =>
                diagnoseProductionOrder(tx, 'SPK-SYN-'),
            );
            expect(ambiguous.kind).toBe('ambiguous');
            expect(ambiguous.candidates).toHaveLength(6);

            const briefing = await db.$transaction((tx) =>
                getProductionBriefing(tx),
            );
            expect(briefing).toMatchObject({ total: 22, truncated: true });
            expect(briefing.items).toHaveLength(20);
            expect(briefing.items.at(-1)?.plannedEndDate).not.toBeNull();
        });

        it('runs inside PostgreSQL read-only repeatable-read and cannot mutate business data', async () => {
            await createOrder({ id: 'order-1', orderNumber: 'SPK-001' });
            const before = await db.productionOrder.findUniqueOrThrow({
                where: { id: 'order-1' },
            });

            await db.$transaction(
                async (tx) => {
                    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
                    const result = await diagnoseProductionOrder(tx, 'order-1');
                    expect(result.kind).toBe('selected');
                    const settings = await tx.$queryRaw<
                        { ro: string; isolation: string }[]
                    >`SELECT current_setting('transaction_read_only') ro, current_setting('transaction_isolation') isolation`;
                    expect(settings[0]).toEqual({
                        ro: 'on',
                        isolation: 'repeatable read',
                    });
                    await tx.$executeRaw`SAVEPOINT write_probe`;
                    await expect(
                        tx.$executeRaw`UPDATE "ProductionOrder" SET "actualQuantity" = 999 WHERE id = 'order-1'`,
                    ).rejects.toThrow(/read-only/);
                    await tx.$executeRaw`ROLLBACK TO SAVEPOINT write_probe`;
                },
                {
                    isolationLevel: 'RepeatableRead',
                },
            );

            expect(
                await db.productionOrder.findUniqueOrThrow({
                    where: { id: 'order-1' },
                }),
            ).toEqual(before);
        });
    },
);
