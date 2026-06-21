"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { OpnameStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  safeAction,
  BusinessRuleError,
  NotFoundError,
  AuthenticationError,
} from "@/lib/errors/errors";
import { auth } from "@/auth";
import { StockOpnameService } from "@/services/inventory/stock-opname-service";

export const getOpnameSessions = withTenant(async function getOpnameSessions() {
  return safeAction(async () => {
    return await prisma.stockOpname.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        location: true,
        createdBy: true,
      },
    });
  });
});

export const getOpnameSession = withTenant(async function getOpnameSession(
  id: string,
) {
  return safeAction(async () => {
    return await prisma.stockOpname.findUnique({
      where: { id },
      include: {
        location: true,
        createdBy: true,
        items: {
          include: {
            productVariant: {
              include: {
                product: true,
              },
            },
          },
          orderBy: {
            productVariant: {
              name: "asc",
            },
          },
        },
      },
    });
  });
});

async function generateOpnameNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  // Format: OPN-YYYYMM-XXXX
  const prefix = `OPN-${year}${month}-`;

  const lastOpname = await prisma.stockOpname.findFirst({
    where: { opnameNumber: { startsWith: prefix } },
    orderBy: { opnameNumber: "desc" },
    select: { opnameNumber: true },
  });

  let nextSeq = 1;
  if (lastOpname?.opnameNumber) {
    // Extract sequence part (last part after dash)
    const parts = lastOpname.opnameNumber.split("-");
    const lastSeqStr = parts[parts.length - 1];
    const lastSeq = parseInt(lastSeqStr, 10);

    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  return `${prefix}${nextSeq.toString().padStart(4, "0")}`;
}

export const createOpnameSession = withTenant(
  async function createOpnameSession(locationId: string, remarks?: string) {
    return safeAction(async () => {
      const session = await auth();
      if (!session?.user?.id) {
        throw new AuthenticationError("User not authenticated");
      }

      // 1. Get all inventories for this location to snapshot
      const inventories = await prisma.inventory.findMany({
        where: {
          locationId: locationId,
        },
      });

      if (inventories.length === 0) {
        throw new BusinessRuleError(
          "No inventory found for this location to perform stock opname.",
        );
      }

      // 2. Generate Number
      const opnameNumber = await generateOpnameNumber();

      // 3. Create Session with audit trail
      const opnameSession = await prisma.stockOpname.create({
        data: {
          opnameNumber,
          locationId,
          remarks,
          status: OpnameStatus.OPEN,
          createdById: session.user.id,
          items: {
            create: inventories.map((inv) => ({
              productVariantId: inv.productVariantId,
              systemQuantity: inv.quantity,
              countedQuantity: null, // Start as null to indicate not counted yet
            })),
          },
        },
      });

      revalidatePath("/warehouse/opname");
      return { id: opnameSession.id };
    });
  },
);

export const saveOpnameCount = withTenant(async function saveOpnameCount(
  opnameId: string,
  items: { id: string; countedQuantity: number; notes?: string }[],
) {
  return safeAction(async () => {
    if (items.length === 0) {
      revalidatePath(`/warehouse/opname/${opnameId}`);
      return;
    }

    const itemIds = items.map((item) => item.id);
    const uniqueItemIds = [...new Set(itemIds)];
    if (uniqueItemIds.length !== itemIds.length) {
      throw new BusinessRuleError(
        "Duplicate stock opname item id in request payload",
      );
    }

    await prisma.$transaction(async (tx) => {
      const matchedCount = await tx.stockOpnameItem.count({
        where: {
          opnameId,
          id: { in: uniqueItemIds },
        },
      });

      if (matchedCount !== items.length) {
        throw new BusinessRuleError(
          "Some stock opname items are invalid for this session",
        );
      }

      const countedQuantityCase = Prisma.sql`
                CASE "id"
                    ${Prisma.join(
                      items.map(
                        (item) =>
                          Prisma.sql`WHEN ${item.id} THEN ${item.countedQuantity}`,
                      ),
                      " ",
                    )}
                    ELSE "countedQuantity"
                END
            `;

      const notesCase = Prisma.sql`
                CASE "id"
                    ${Prisma.join(
                      items.map(
                        (item) =>
                          Prisma.sql`WHEN ${item.id} THEN ${item.notes ?? null}`,
                      ),
                      " ",
                    )}
                    ELSE "notes"
                END
            `;

      await tx.$executeRaw(Prisma.sql`
                UPDATE "StockOpnameItem"
                SET
                    "countedQuantity" = ${countedQuantityCase},
                    "notes" = ${notesCase}
                WHERE
                    "opnameId" = ${opnameId}
                    AND "id" IN (${Prisma.join(uniqueItemIds)});
            `);
    });

    revalidatePath(`/warehouse/opname/${opnameId}`);
  });
});

export const completeOpname = withTenant(async function completeOpname(
  opnameId: string,
) {
  return safeAction(async () => {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AuthenticationError("User not authenticated");
    }

    await StockOpnameService.completeOpname(opnameId, session.user.id);
    revalidatePath(`/warehouse/opname/${opnameId}`);
  });
});

export const addItemToOpname = withTenant(async function addItemToOpname(
  opnameId: string,
  productVariantId: string,
) {
  return safeAction(async () => {
    // Validasi sesi harus OPEN
    const opname = await prisma.stockOpname.findUnique({
      where: { id: opnameId },
      select: { status: true, locationId: true },
    });

    if (!opname) throw new NotFoundError("StockOpname", opnameId);
    if (opname.status !== "OPEN")
      throw new BusinessRuleError("Can only add items to OPEN sessions");

    // Validasi productVariant exists
    const variant = await prisma.productVariant.findUnique({
      where: { id: productVariantId },
      select: { id: true, name: true },
    });

    if (!variant) throw new NotFoundError("ProductVariant", productVariantId);

    // Cek duplikasi: item sudah ada di sesi ini?
    const existing = await prisma.stockOpnameItem.findUnique({
      where: {
        opnameId_productVariantId: {
          opnameId,
          productVariantId,
        },
      },
    });

    if (existing) {
      throw new BusinessRuleError(
        `Item "${variant.name}" already exists in this opname session`,
      );
    }

    // Insert item baru dengan systemQuantity = 0
    await prisma.stockOpnameItem.create({
      data: {
        opnameId,
        productVariantId,
        systemQuantity: 0,
        countedQuantity: null,
      },
    });

    revalidatePath(`/warehouse/opname/${opnameId}`);
    revalidatePath("/warehouse/opname");
  });
});

export const deleteOpnameSession = withTenant(
  async function deleteOpnameSession(id: string) {
    return safeAction(async () => {
      const session = await prisma.stockOpname.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!session) {
        throw new NotFoundError("StockOpname", id);
      }

      if (session.status !== "OPEN") {
        throw new BusinessRuleError("Only OPEN sessions can be deleted");
      }

      await prisma.stockOpname.delete({
        where: { id },
      });

      revalidatePath("/warehouse/opname");
    });
  },
);
