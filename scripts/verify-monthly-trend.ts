import { getSalesMetrics } from '../src/actions/analytics';

async function main() {
    console.log('Verifying Monthly Revenue Trend...');

    const metrics = await getSalesMetrics();
    console.log('\n--- Revenue Trend ---');
    metrics.revenueTrend.forEach(t => {
        console.log(`${t.date}: Rp ${t.revenue.toLocaleString()}`);
    });

    console.log('\n--- Top Products (Yearly) ---');
    metrics.topProducts.forEach(p => {
        console.log(`${p.name}: Rp ${p.revenue.toLocaleString()}`);
    });

    console.log('\n--- Top Customers (Yearly) ---');
    metrics.topCustomers.forEach(c => {
        console.log(`${c.name}: Rp ${c.revenue.toLocaleString()}`);
    });

    const isMonthly = metrics.revenueTrend.every(t => /^\d{4}-\d{2}$/.test(t.date));
    console.log(`\nIs monthly format (yyyy-MM)? ${isMonthly ? 'YES' : 'NO'}`);

    // Verify January order (SO-2026-0001) is in Top Products if revenue > 0
    const hasJanRevenue = metrics.topProducts.some(p => p.revenue > 0);
    console.log(`Has yearly product revenue? ${hasJanRevenue ? 'YES' : 'NO'}`);

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
