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
        // 2. Fetch Inventory
        const inventory = await prisma.inventory.findMany({
            where: {
                quantity: { gt: 0 }, // Only show items with stock
            },
            include: {
                productVariant: {
                    select: {
                        id: true,
                        name: true,
                        skuCode: true,
                        primaryUnit: true,
                    },
                },
                location: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
            },
            orderBy: { updatedAt: "desc" },
        });

        // 3. Transform data for API response
        const data = inventory.map((item) => ({
            variantId: item.productVariant.id,
            variantName: item.productVariant.name,
            sku: item.productVariant.skuCode,
            locationId: item.location.id,
            locationName: item.location.name,
            quantity: Number(item.quantity),
            unit: item.productVariant.primaryUnit,
            updatedAt: item.updatedAt,
        }));

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
