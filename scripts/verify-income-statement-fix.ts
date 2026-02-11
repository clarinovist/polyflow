
import { getIncomeStatement } from '../src/services/accounting/reports-service';
import { prisma } from '../src/lib/prisma';

async function run() {
    const startDate = new Date('2026-02-01T00:00:00.000Z');
    const endDate = new Date('2026-02-28T23:59:59.999Z');

    console.log(`📊 Verifying Income Statement for Feb 2026...`);

    try {
        const report = await getIncomeStatement(startDate, endDate);

        console.log('\n--- REPORT SUMMARY ---');
        console.log(`Total Revenue: ${report.totalRevenue.toLocaleString('id-ID')}`);
        console.log(`Total COGS: ${report.totalCOGS.toLocaleString('id-ID')}`);
        console.log(`Gross Profit: ${report.grossProfit.toLocaleString('id-ID')}`);
        console.log(`Total OpEx: ${report.totalOpEx.toLocaleString('id-ID')}`);
        console.log(`Operating Income: ${report.operatingIncome.toLocaleString('id-ID')}`);
        console.log(`Total Other: ${report.totalOther.toLocaleString('id-ID')}`);
        console.log(`Net Income: ${report.netIncome.toLocaleString('id-ID')}`);

        console.log('\n--- BREAKDOWN ---');
        console.log('REVENUE ACCOUNTS:');
        report.revenue.forEach(a => console.log(`- ${a.code} ${a.name}: ${a.netBalance.toLocaleString()}`));

        console.log('OTHER ACCOUNTS:');
        report.other.forEach(a => console.log(`- ${a.code} ${a.name}: ${a.netBalance.toLocaleString()}`));

    } catch (error) {
        console.error('Error running report:', error);
    } finally {
        await prisma.$disconnect();
    }
}

run();
