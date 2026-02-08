import { getSalesMetrics } from '../src/actions/analytics';
import { getPurchasingAnalytics } from '../src/actions/purchasing-analytics';

async function main() {
    console.log('Verifying Analytics MTD Defaults...');

    const sales = await getSalesMetrics();
    console.log('\n--- Sales Analytics (MTD Default) ---');
    console.log(`Total Revenue: Rp ${sales.totalRevenue.toLocaleString()}`);
    console.log(`Total Orders: ${sales.totalOrders}`);

    const purchasing = await getPurchasingAnalytics();
    // Calculate total spend from chart data
    const totalSpend = purchasing.spendTrend.chartData.reduce((acc, curr) => acc + curr.spend, 0);
    console.log('\n--- Purchasing Analytics (MTD Default) ---');
    console.log(`Total Spend: Rp ${totalSpend.toLocaleString()}`);

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
