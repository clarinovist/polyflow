import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateExternalRequest } from "@/lib/external-api-helper";

export async function GET(req: NextRequest) {
    // 1. Validate API Key
    const { isValid, response } = await validateExternalRequest(req);
    if (!isValid) {
        return response;
    }

    try {
        // 2. Fetch Products (Simplified version of getProducts action)
        // We don't use the action directly because it requires session auth
        const products = await prisma.product.findMany({
            include: {
                variants: {
                    include: {
                        inventories: {
                            select: {
                                quantity: true,
                                location: { select: { name: true } },
                            },
                        },
                    },
                    orderBy: { name: "asc" },
                },
            },
            orderBy: { name: "asc" },
        });

        // 3. Transform data for API response
        const data = products.map((product) => {
            let totalStock = 0;
            const variants = product.variants.map((variant) => {
                const stock = variant.inventories.reduce(
                    (sum, inv) => sum + Number(inv.quantity),
                    0
                );
                totalStock += stock;
                return {
                    id: variant.id,
                    name: variant.name,
                    sku: variant.skuCode,
                    price: variant.price,
                    stock: stock,
                    units: variant.primaryUnit,
                };
            });

            return {
                id: product.id,
                name: product.name,
                type: product.productType,
                totalStock,
                variants,
            };
        });

        return NextResponse.json({
            success: true,
            count: data.length,
            data,
        });
    } catch (error) {
        console.error("External API Error:", error);
        return NextResponse.json(
            { success: false, error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
