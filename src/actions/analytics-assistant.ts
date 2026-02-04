'use server';

import { fireworks, SQL_MODEL_ID } from "@/lib/fireworks";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

// Dedicated client for read-only operations (fallback to standard if env not set)
// Ideally, this should connect with a user that has only SELECT permissions.
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL_READONLY || process.env.DATABASE_URL
        }
    }
});

// Simplified schema context for the AI
const DB_CONTEXT = `
Database Schema (PostgreSQL/Prisma):
- Customer(id, name, code, email, creditLimit, isActive)
- SalesOrder(id, orderNumber, customerId, totalAmount, status, orderDate)
- SalesOrderItem(id, salesOrderId, productVariantId, quantity, unitPrice)
- Product(id, name, productType)
- ProductVariant(id, productId, name, price, stockLevel)
- Inventory(id, productVariantId, locationId, quantity)
- Machine(id, code, name, status, locationId)
- ProductionOrder(id, orderNumber, machineId, productVariantId, quantity, status)
- Location(id, name, slug)
- Invoice(id, invoiceNumber, salesOrderId, totalAmount, status)
`;

export async function generateAndRunQuery(question: string) {
    const session = await auth();
    if (!session || !['ADMIN', 'FINANCE', 'PLANNING'].includes(session.user.role)) {
        throw new Error("Unauthorized");
    }

    try {
        console.log(`Generating SQL for: "${question}" using model ${SQL_MODEL_ID}`);

        const response = await fireworks.chat.completions.create({
            model: SQL_MODEL_ID,
            messages: [
                {
                    role: "system",
                    content: `You are a helpful data assistant for Polyflow (an ERP system). 
                    Your task is to convert natural language questions into safe, efficient PostgreSQL queries.
                    
                    ${DB_CONTEXT}

                    RULES:
                    1. ONLY generate SELECT statements.
                    2. NEVER generate INSERT, UPDATE, DELETE, DROP, or ALTER statements.
                    3. Use double quotes for table and column names to ensure case sensitivity (e.g., "SalesOrder", "totalAmount").
                    4. ALWAYS use the exact column names from the schema provided above (e.g., use "id" NOT "CustomerID", use "customerId" NOT "CustomerID").
                    5. If the question cannot be answered with the database, explain why.
                    6. Output ONLY the raw SQL query, without markdown formatting or explanation.`
                },
                { role: "user", content: question }
            ],
            temperature: 0.1,
            max_tokens: 500,
        });

        let sql = response.choices[0].message.content?.trim() || "";

        // Remove markdown code blocks if present
        sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();

        console.log(`Generated SQL: ${sql}`);

        // Basic Safety Validation
        const forbiddenKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE'];
        if (forbiddenKeywords.some(keyword => sql.toUpperCase().includes(keyword))) {
            throw new Error("Generated query contains forbidden keywords (Modification detected).");
        }

        if (!sql.toUpperCase().startsWith('SELECT') && !sql.toUpperCase().startsWith('WITH')) {
            throw new Error("Only SELECT queries are allowed.");
        }

        // Execute Query
        // We use $queryRawUnsafe because the SQL is generated dynamically.
        // The read-only DB user is the primary defense here.
        const result = await prisma.$queryRawUnsafe(sql);

        // serialize BigInt
        const serializedResult = JSON.parse(JSON.stringify(result, (key, value) =>
            typeof value === 'bigint'
                ? value.toString()
                : value // return everything else unchanged
        ));

        return { success: true, sql, data: serializedResult };

    } catch (error: unknown) {
        console.error("AI Query Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
    }
}
