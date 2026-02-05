import { getProducts } from './src/actions/product.ts';

async function verifyCosts() {
    console.log('--- Verifying Product Costs ---');
    try {
        const products = await getProducts();

        // Find PKHDT002
        let pkhdt002 = null;
        for (const p of products) {
            const variant = p.variants.find(v => v.skuCode === 'PKHDT002');
            if (variant) {
                pkhdt002 = variant;
                break;
            }
        }

        if (pkhdt002) {
            console.log('PKHDT002 Found:');
            console.log(`- Standard Cost: ${pkhdt002.standardCost}`);
            console.log(`- Buy Price: ${pkhdt002.buyPrice}`);
            console.log(`- Catalog Price: ${pkhdt002.price}`);

            if (pkhdt002.standardCost !== undefined && pkhdt002.buyPrice !== undefined) {
                console.log('SUCCESS: Cost fields are present in the response.');
            } else {
                console.log('FAILURE: One or more cost fields are missing.');
            }
        } else {
            console.log('PKHDT002 not found in catalog.');
        }

    } catch (error) {
        console.error('Verification failed:', error);
    }
}

verifyCosts();
