
import fs from 'fs';
import path from 'path';

// This script will help you generate a dataset for fine-tuning.
// Ideally, you would use an LLM to generate these pairs based on the schema.
// For now, I'm providing a robust template that you can either fill manually
// or we can hook up to an API to generate automatically.

const SCHEMA_PATH = path.join(process.cwd(), 'prisma', 'schema.prisma');
const OUTPUT_PATH = path.join(process.cwd(), 'fine_tuning_dataset.jsonl');

async function main() {
    const _schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');

    console.log('Read schema from:', SCHEMA_PATH);
    console.log('Generating synthetic dataset...');

    // In a real scenario, we would call an AI API here with the schema
    // and ask it to generate questions.
    // For this demonstration, I will populate some high-quality examples
    // relevant to your Polyflow schema.

    const examples = [
        // --- SALES ---
        {
            messages: [
                { role: "user", content: "Show me the top 10 customers by credit limit." },
                { role: "assistant", content: "SELECT name, \"creditLimit\" FROM \"Customer\" ORDER BY \"creditLimit\" DESC LIMIT 10;" }
            ]
        },
        {
            messages: [
                { role: "user", content: "List all sales orders created today." },
                { role: "assistant", content: "SELECT * FROM \"SalesOrder\" WHERE \"createdAt\" >= CURRENT_DATE;" }
            ]
        },
        {
            messages: [
                { role: "user", content: "Count the number of sales orders by status." },
                { role: "assistant", content: "SELECT status, COUNT(*) FROM \"SalesOrder\" GROUP BY status;" }
            ]
        },

        // --- PRODUCTION ---
        {
            messages: [
                { role: "user", content: "Which machines are currently under maintenance?" },
                { role: "assistant", content: "SELECT name, code FROM \"Machine\" WHERE status = 'MAINTENANCE';" }
            ]
        },
        {
            messages: [
                { role: "user", content: "Total production quantity for order WO-12345." },
                { role: "assistant", content: "SELECT SUM(\"quantityProduced\") FROM \"ProductionExecution\" WHERE \"productionOrderId\" = (SELECT id FROM \"ProductionOrder\" WHERE \"orderNumber\" = 'WO-12345');" }
            ]
        },

        // --- FINANCE ---
        {
            messages: [
                { role: "user", content: "Show me all unpaid sales invoices." },
                { role: "assistant", content: "SELECT \"invoiceNumber\", \"remainingAmount\" FROM \"SalesInvoice\" WHERE status != 'PAID';" }
            ]
        },

        // --- WAREHOUSE ---
        {
            messages: [
                { role: "user", content: "List items in the Raw Material warehouse with low stock (less than 100)." },
                { role: "assistant", content: "SELECT pv.name, i.quantity FROM \"Inventory\" i JOIN \"ProductVariant\" pv ON i.\"productVariantId\" = pv.id JOIN \"Location\" l ON i.\"locationId\" = l.id WHERE l.slug = 'rm_warehouse' AND i.quantity < 100;" }
            ]
        }
    ];

    // Write to JSONL
    const stream = fs.createWriteStream(OUTPUT_PATH);

    examples.forEach(ex => {
        stream.write(JSON.stringify(ex) + '\n');
    });

    stream.end();

    console.log(`Successfully wrote ${examples.length} examples to ${OUTPUT_PATH}`);
    console.log('You can upload this file to Fireworks AI to start fine-tuning.');
}

main().catch(console.error);
