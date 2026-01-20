
import { StockAgingService } from '../src/services/stock-aging-service';
import { prisma } from '../src/lib/prisma';
import { ProductType, Unit } from '@prisma/client';
import { subDays } from 'date-fns';

async function main() {
    console.log('Starting Stock Aging Verification...');

    // 1. Create Test Data
    const product = await prisma.product.create({
        data: { name: 'Aging Test Product', productType: ProductType.RAW_MATERIAL }
    });

    const variant = await prisma.productVariant.create({
        data: {
            productId: product.id,
            name: 'Aging Variant',
            skuCode: `AGING-${Date.now()}`,
            buyPrice: 100,
            primaryUnit: Unit.PCS
        }
    });

    const location = await prisma.location.findFirst();
    if (!location) throw new Error('No location found');

    // Create Batches with different ages
    // 0-30 days
    await prisma.batch.create({
        data: {
            batchNumber: `B1-${Date.now()}`,
            productVariantId: variant.id,
            locationId: location.id,
            quantity: 10,
            manufacturingDate: subDays(new Date(), 10),
            status: 'ACTIVE'
        }
    });

    // 31-60 days
    await prisma.batch.create({
        data: {
            batchNumber: `B2-${Date.now()}`,
            productVariantId: variant.id,
            locationId: location.id,
            quantity: 20,
            manufacturingDate: subDays(new Date(), 45),
            status: 'ACTIVE'
        }
    });

    // 90+ days
    await prisma.batch.create({
        data: {
            batchNumber: `B3-${Date.now()}`,
            productVariantId: variant.id,
            locationId: location.id,
            quantity: 5,
            manufacturingDate: subDays(new Date(), 100),
            status: 'ACTIVE'
        }
    });

    console.log('Calculating Aging...');
    const results = await StockAgingService.calculateStockAging();
    const res = results.find(r => r.productVariantId === variant.id);

    if (!res) throw new Error('Result not found');

    console.log('Results:', JSON.stringify(res.buckets, null, 2));

    // Verify
    if (res.buckets['0-30'].quantity !== 10) throw new Error('Bucket 0-30 failed');
    if (res.buckets['31-60'].quantity !== 20) throw new Error('Bucket 31-60 failed');
    if (res.buckets['90+'].quantity !== 5) throw new Error('Bucket 90+ failed');

    // Summary Test
    const summary = await StockAgingService.getAgingSummary();
    console.log('Summary:', summary);

    // Value = (10*100) + (20*100) + (5*100) = 1000 + 2000 + 500 = 3500
    // Aged Value (>90) = 500
    // % = 500/3500 * 100 = 14.28%

    console.log('Aging Verification Successful!');

    // Cleanup
    await prisma.batch.deleteMany({ where: { productVariantId: variant.id } });
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
