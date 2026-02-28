import { ApiKeyService } from "@/services/api-key-service";

async function main() {
    const baseUrl = "http://localhost:3000"; // Adjust if running on different port
    const endpoint = "/api/external/v1/products";

    console.log("--- External API Test Script ---");

    // 1. Generate a Test API Key
    console.log("\n1. Generating Test API Key...");
    const apiKey = await ApiKeyService.createApiKey("Test Script Key", undefined, 1);
    console.log(`   Key Created: ${apiKey.key}`);

    // 2. Test without Key (Expect 401)
    console.log("\n2. Testing Request WITHOUT Key...");
    try {
        const resNoKey = await fetch(`${baseUrl}${endpoint}`);
        console.log(`   Status: ${resNoKey.status} (Expected 401)`);
        if (resNoKey.status === 401) {
            console.log("   ✅ Success: Access Denied as expected.");
        } else {
            console.log("   ❌ Failed: Should have been 401.");
        }
    } catch (e) {
        console.log("   ⚠️ Could not connect to localhost. API might not be running or is building.");
    }

    // 3. Test with Key (Expect 200)
    console.log("\n3. Testing Request WITH Key...");
    try {
        const resWithKey = await fetch(`${baseUrl}${endpoint}`, {
            headers: {
                "X-API-KEY": apiKey.key,
            },
        });
        console.log(`   Status: ${resWithKey.status} (Expected 200)`);

        if (resWithKey.status === 200) {
            const data = await resWithKey.json();
            console.log("   ✅ Success: Data received.");
            console.log(`   Items Found: ${data.count}`);
            if (data.count > 0) {
                console.log("   Sample Item:", JSON.stringify(data.data[0], null, 2));
            }
        } else {
            const errorText = await resWithKey.text();
            console.log(`   ❌ Failed. Response: ${errorText}`);
        }
    } catch (e) {
        console.log("   ⚠️ Could not connect to localhost. API might not be running or is building.");
    }

    console.log("\n4. Testing Inventory Endpoint...");
    try {
        const endpointInv = "/api/external/v1/inventory";
        const resInv = await fetch(`${baseUrl}${endpointInv}`, {
            headers: {
                "X-API-KEY": apiKey.key,
            },
        });
        console.log(`   Status: ${resInv.status} (Expected 200)`);
        if (resInv.status === 200) {
            const data = await resInv.json();
            console.log("   ✅ Success: Inventory data received.");
            console.log(`   Items Found: ${data.count}`);
            if (data.count > 0) {
                console.log("   Sample Inventory Item:", JSON.stringify(data.data[0], null, 2));
            }
        } else {
            const errorText = await resInv.text();
            console.log(`   ❌ Failed. Response: ${errorText}`);
        }
    } catch (e) {
        console.error("   ⚠️ Failed to test inventory endpoint", e);
    }

    console.log("\n--- Test Complete ---");
}

// We need to run this in a context where Prisma Client works.
// Since we are using ts-node or similar in the 'scripts' folder, allow direct execution.
main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
