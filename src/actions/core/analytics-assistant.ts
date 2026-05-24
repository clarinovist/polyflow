'use server';

import { withTenant } from "@/lib/core/tenant";
import { fireworks, SQL_MODEL_ID } from "@/lib/tools/fireworks";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import { logger } from "@/lib/config/logger";
import { safeAction, AuthorizationError, BusinessRuleError } from "@/lib/errors/errors";

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL_READONLY || process.env.DATABASE_URL
        }
    }
});

const DB_CONTEXT = `
Database Schema (PostgreSQL/Prisma):
- Customer(id, name, code, email, creditLimit, isActive)
- SalesOrder(id, orderNumber, customerId, totalAmount, status, orderDate)
- SalesOrderItem(id, salesOrderId, productVariantId, quantity, unitPrice)
- Product(id, name, productType)
- ProductVariant(id, productId, name, price)
- Inventory(id, productVariantId, locationId, quantity)
- Machine(id, code, name, status, locationId)
- ProductionOrder(id, orderNumber, machineId, bomId, plannedQuantity, status, createdAt, actualStartDate)
- Bom(id, productVariantId, outputQuantity, createdAt)
- BomItem(id, bomId, productVariantId, quantity)
- Location(id, name, slug)
- Invoice(id, invoiceNumber, salesOrderId, totalAmount, status)

RELATIONSHIPS:
- ProductionOrder linked to ProductVariant via Bom: ProductionOrder.bomId -> Bom.id, then Bom.productVariantId -> ProductVariant.id
- Product stock is in Inventory table, NOT in ProductVariant.
`;

export const generateAndRunQuery = withTenant(
async function generateAndRunQuery(question: string) {
    return safeAction(async () => {
        const session = await auth();
        if (!session || !['ADMIN', 'FINANCE', 'PLANNING'].includes(session.user.role)) {
            throw new AuthorizationError("Unauthorized");
        }

        try {
            logger.info(`Generating SQL for: "${question}"`, { model: SQL_MODEL_ID, module: 'AnalyticsAssistant' });

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
                        3. Use double quotes for table and column names to ensure case sensitivity (e.g., "SalesOrder", "totalAmount"). For aliased tables, quote camelCase columns as alias."columnName" (e.g., b."createdAt", po."orderNumber").
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

            logger.debug('Generated SQL', { sql, module: 'AnalyticsAssistant' });

            // Basic Safety Validation

            // 1. Prohibit multi-statement queries
            if (sql.includes(';')) {
                throw new BusinessRuleError("Multi-statement queries are not allowed (semicolon detected).");
            }

            // 2. Prohibit comments to prevent bypasses
            if (sql.includes('--') || sql.includes('/*') || sql.includes('*/')) {
                throw new BusinessRuleError("SQL comments are not allowed.");
            }

            // 3. Prohibit forbidden keywords with word boundaries (case-insensitive)
            const forbiddenKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'CREATE'];
            for (const keyword of forbiddenKeywords) {
                const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                if (regex.test(sql)) {
                    throw new BusinessRuleError(`Generated query contains forbidden keyword: ${keyword}`);
                }
            }

            const sqlUpper = sql.trim().toUpperCase();
            if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
                throw new BusinessRuleError("Only SELECT queries are allowed.");
            }

            // Execute Query
            const result = await prisma.$queryRawUnsafe(sql);

            // serialize BigInt
            const serializedResult = JSON.parse(JSON.stringify(result, (key, value) =>
                typeof value === 'bigint'
                    ? value.toString()
                    : value // return everything else unchanged
            ));

            return { sql, data: serializedResult };
        } catch (error: unknown) {
            if (error instanceof AuthorizationError || error instanceof BusinessRuleError) throw error;
            logger.error("AI Query Error", { error, question, module: 'AnalyticsAssistant' });
            throw new BusinessRuleError(error instanceof Error ? error.message : "Unknown error");
        }
    });
}
);
