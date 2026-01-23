
import { getExecutiveStats } from '../src/actions/dashboard';
import { prisma } from '../src/lib/prisma';

async function main() {
    try {
        console.log('Fetching Executive Stats...');
        const stats = await getExecutiveStats();

        console.log('--- Production Metrics ---');
        console.log(JSON.stringify(stats.production, null, 2));

        console.log('\n--- Verification ---');
        console.log(`Yield Rate: ${stats.production.yieldRate.toFixed(2)}%`);
        console.log(`Total Scrap: ${stats.production.totalScrapKg.toFixed(2)} kg`);
        console.log(`Downtime: ${stats.production.downtimeHours.toFixed(2)} hrs`);
        console.log(`Running Machines: ${stats.production.runningMachines} / ${stats.production.totalMachines}`);

    } catch (error) {
        console.error('Error fetching stats:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
