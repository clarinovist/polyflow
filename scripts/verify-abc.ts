
import { ABCAnalysisService } from '../src/services/abc-analysis-service';
import { prisma } from '../src/lib/prisma';
import { ProductType, Unit } from '@prisma/client';

async function main() {
    console.log('Starting ABC Verification...');

    // 1. Create Data Setup
    // Create 3 products: High Value, Medium Value, Low Value
    const product = await prisma.product.create({
        data: { name: 'ABC Test Product', productType: ProductType.RAW_MATERIAL }
    });

    // Item A: High Consumption Value
    const itemA = await prisma.productVariant.create({
        data: {
            productId: product.id,
            name: 'Item A (High)',
            skuCode: `ABC-A-${Date.now()}`,
            buyPrice: 1000,
            primaryUnit: Unit.PCS
        }
    });

    // Item B: Medium Consumption Value
    const itemB = await prisma.productVariant.create({
        data: {
            productId: product.id,
            name: 'Item B (Med)',
            skuCode: `ABC-B-${Date.now()}`,
            buyPrice: 100,
            primaryUnit: Unit.PCS
        }
    });

    // Item C: Low Consumption Value
    const itemC = await prisma.productVariant.create({
        data: {
            productId: product.id,
            name: 'Item C (Low)',
            skuCode: `ABC-C-${Date.now()}`,
            buyPrice: 10,
            primaryUnit: Unit.PCS
        }
    });

    const location = await prisma.location.findFirst();
    if (!location) throw new Error('No location');

    // Simulate Consumption (Outgoing Stock)
    // A: 1000 * 80 units = 80,000 value
    await prisma.stockMovement.create({
        data: {
            productVariantId: itemA.id,
            type: 'OUT',
            quantity: 80,
            fromLocationId: location.id,
            toLocationId: null,
        }
    });

    // B: 100 * 150 units = 15,000 value
    await prisma.stockMovement.create({
        data: {
            productVariantId: itemB.id,
            type: 'OUT',
            quantity: 150,
            fromLocationId: location.id,
            toLocationId: null,
        }
    });

    // C: 10 * 500 units = 5,000 value
    await prisma.stockMovement.create({
        data: {
            productVariantId: itemC.id,
            type: 'OUT',
            quantity: 500,
            fromLocationId: location.id,
            toLocationId: null,
        }
    });

    // Total Value = 80k + 15k + 5k = 100k
    // A: 80% -> Class A
    // B: 15% -> Cumulative 95% -> Class B
    // C: 5% -> Cumulative 100% -> Class C

    console.log('Calculating ABC...');
    const results = await ABCAnalysisService.calculateABCClassification();

    const resA = results.find(r => r.productVariantId === itemA.id);
    const resB = results.find(r => r.productVariantId === itemB.id);
    const resC = results.find(r => r.productVariantId === itemC.id);

    console.log(`Item A: Value=${resA?.annualConsumptionValue}, Class=${resA?.class}`);
    console.log(`Item B: Value=${resB?.annualConsumptionValue}, Class=${resB?.class}`);
    console.log(`Item C: Value=${resC?.annualConsumptionValue}, Class=${resC?.class}`);

    if (resA?.class !== 'A') throw new Error(`Item A should be A, got ${resA?.class}`);
    if (resB?.class !== 'B') throw new Error(`Item B should be B, got ${resB?.class}`);
    if (resC?.class !== 'C') throw new Error(`Item C should be C, got ${resC?.class}`);

    console.log('ABC Verification Successful!');

    // Cleanup
    await prisma.stockMovement.deleteMany({ where: { productVariantId: { in: [itemA.id, itemB.id, itemC.id] } } });
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
