
import { ProductType, Unit, Role } from '@prisma/client';
import { InventoryService } from '../src/services/inventory-service';
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('Starting WAC Verification...');

    // 1. Create a dummy user if not exists (for createdBy)
    let user = await prisma.user.findFirst();
    if (!user) {
        user = await prisma.user.create({
            data: {
                name: 'Test User',
                email: 'test@example.com',
                password: 'hashedpassword',
                role: Role.WAREHOUSE
            }
        });
    }

    // 2. Create a test product
    const product = await prisma.product.create({
        data: {
            name: 'WAC Test Product',
            productType: ProductType.RAW_MATERIAL,
        }
    });

    const variant = await prisma.productVariant.create({
        data: {
            productId: product.id,
            name: 'WAC Test Variant',
            skuCode: `WAC-${Date.now()}`,
            buyPrice: 100, // Standard/Initial price
            primaryUnit: Unit.PCS
        }
    });

    const location = await prisma.location.findFirst();
    if (!location) throw new Error('No location found');

    console.log(`Created Product: ${product.name}, Variant: ${variant.name}`);

    // 3. Initial Stock: 10 units @ $100
    console.log('Step 1: Adding 10 units @ $100');
    await InventoryService.adjustStock({
        locationId: location.id,
        productVariantId: variant.id,
        type: 'ADJUSTMENT_IN',
        quantity: 10,
        unitCost: 100,
        reason: 'Initial Stock'
    }, user.id);

    let inventory = await prisma.inventory.findUnique({
        where: { locationId_productVariantId: { locationId: location.id, productVariantId: variant.id } }
    });
    console.log(`Inventory: Qty=${inventory?.quantity}, AvgCost=${inventory?.averageCost}`);
    if (inventory?.averageCost?.toNumber() !== 100) throw new Error('WAC Step 1 Failed');

    // 4. Second Stock: 10 units @ $200
    console.log('Step 2: Adding 10 units @ $200');
    await InventoryService.adjustStock({
        locationId: location.id,
        productVariantId: variant.id,
        type: 'ADJUSTMENT_IN',
        quantity: 10,
        unitCost: 200,
        reason: 'Second Stock'
    }, user.id);

    inventory = await prisma.inventory.findUnique({
        where: { locationId_productVariantId: { locationId: location.id, productVariantId: variant.id } }
    });
    // Expected: (10*100 + 10*200) / 20 = 3000 / 20 = 150
    console.log(`Inventory: Qty=${inventory?.quantity}, AvgCost=${inventory?.averageCost}`);
    if (inventory?.averageCost?.toNumber() !== 150) throw new Error(`WAC Step 2 Failed. Expected 150, got ${inventory?.averageCost}`);

    // 5. Outgoing Stock: 5 units (Should not change cost)
    console.log('Step 3: Removing 5 units');
    await InventoryService.adjustStock({
        locationId: location.id,
        productVariantId: variant.id,
        type: 'ADJUSTMENT_OUT',
        quantity: 5,
        reason: 'Usage'
    }, user.id);

    inventory = await prisma.inventory.findUnique({
        where: { locationId_productVariantId: { locationId: location.id, productVariantId: variant.id } }
    });
    console.log(`Inventory: Qty=${inventory?.quantity}, AvgCost=${inventory?.averageCost}`);
    if (inventory?.averageCost?.toNumber() !== 150) throw new Error(`WAC Step 3 Failed. Expected 150, got ${inventory?.averageCost}`);

    console.log('WAC Verification Successful!');

    // Cleanup
    await prisma.stockMovement.deleteMany({ where: { productVariantId: variant.id } });
    await prisma.inventory.deleteMany({ where: { productVariantId: variant.id } });
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
