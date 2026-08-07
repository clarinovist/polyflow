import { withTenantRoute } from '@/lib/core/tenant';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/prisma';
import { requireApiRoles } from '@/lib/tools/api-auth';
import { Prisma, ProductType } from '@prisma/client';

const MAX_VARIANTS = 50;
const MAX_BOMS_PER_VARIANT = 10;

/** Relasi Bom pada ProductVariant bernama `productionBoms` (@relation("ProductBom")). */
const ACTIVE_BOM: Prisma.BomWhereInput = { isActive: true, archivedAt: null };

const BASE_SELECT = {
    id: true,
    skuCode: true,
    name: true,
    product: { select: { name: true, productType: true } },
} satisfies Prisma.ProductVariantSelect;

const BOM_SELECT = {
    _count: { select: { productionBoms: { where: ACTIVE_BOM } } },
    productionBoms: {
        where: ACTIVE_BOM,
        take: MAX_BOMS_PER_VARIANT,
        orderBy: { isDefault: 'desc' },
        select: {
            id: true,
            name: true,
            isDefault: true,
            outputQuantity: true,
        },
    },
} satisfies Prisma.ProductVariantSelect;

type BaseVariant = Prisma.ProductVariantGetPayload<{
    select: typeof BASE_SELECT;
}>;

const toBaseVariant = (v: BaseVariant) => ({
    id: v.id,
    skuCode: v.skuCode,
    name: v.name,
    product: v.product,
});

const isProductType = (value: string): value is ProductType =>
    Object.prototype.hasOwnProperty.call(ProductType, value);

export const GET = withTenantRoute(async function GET(req: Request) {
    const auth = await requireApiRoles([
        'ADMIN',
        'PLANNING',
        'PRODUCTION',
        'SALES',
    ]);
    if (auth.response) return auth.response;

    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.trim() ?? '';
    const typeParam = url.searchParams.get('type')?.trim() ?? '';
    const allowedTypes = typeParam
        .split(',')
        .map((t) => t.trim())
        .filter(isProductType);
    const hasBomParam = url.searchParams.get('hasBom')?.trim() === 'true';
    const includeCount =
        url.searchParams.get('includeBomCount')?.trim() === 'true' ||
        hasBomParam;

    const where: Prisma.ProductVariantWhereInput = {
        ...(q
            ? {
                  OR: [
                      { skuCode: { contains: q, mode: 'insensitive' } },
                      { name: { contains: q, mode: 'insensitive' } },
                  ],
              }
            : {}),
        ...(allowedTypes.length > 0
            ? { product: { productType: { in: allowedTypes } } }
            : {}),
        // hanya variant yang punya minimal satu BOM aktif
        ...(hasBomParam ? { productionBoms: { some: ACTIVE_BOM } } : {}),
    };

    const query = {
        where,
        orderBy: { skuCode: 'asc' },
        take: MAX_VARIANTS,
    } satisfies Omit<Prisma.ProductVariantFindManyArgs, 'select' | 'include'>;

    // Dua cabang eksplisit supaya select tetap ter-typecheck oleh Prisma —
    // spread kondisional di dalam satu `select` melumpuhkan inference-nya.
    // `bomCount` + `boms` dipertahankan sebagai nama field response (kontrak client).
    if (includeCount) {
        const variants = await prisma.productVariant.findMany({
            ...query,
            select: { ...BASE_SELECT, ...BOM_SELECT },
        });
        return NextResponse.json(
            variants.map((v) => ({
                ...toBaseVariant(v),
                bomCount: v._count.productionBoms,
                boms: v.productionBoms,
            })),
        );
    }

    const variants = await prisma.productVariant.findMany({
        ...query,
        select: BASE_SELECT,
    });
    return NextResponse.json(variants.map(toBaseVariant));
});
