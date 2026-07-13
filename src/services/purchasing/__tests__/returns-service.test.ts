import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    purchaseReturn: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    inventory: {
      upsert: vi.fn(),
    },
    stockMovement: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

vi.mock("@/lib/config/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/services/finance/auto-journal-service", () => ({
  AutoJournalService: {
    handlePurchaseReturnShipped: vi.fn(),
  },
}));

import { prisma } from "@/lib/core/prisma";
import { logActivity } from "@/lib/tools/audit";
import { logger } from "@/lib/config/logger";
import { AutoJournalService } from "@/services/finance/auto-journal-service";
import { PurchaseReturnService } from "../returns-service";
import { PurchaseReturnStatus, MovementType } from "@prisma/client";

const mockPrisma = vi.mocked(prisma);
const mockLogActivity = vi.mocked(logActivity);
const mockLogger = vi.mocked(logger);
const mockAutoJournal = vi.mocked(AutoJournalService);

const createInput = {
  purchaseOrderId: "po-1",
  goodsReceiptId: "gr-1",
  supplierId: "sup-1",
  sourceLocationId: "loc-1",
  reason: "Damaged items",
  notes: "test",
  items: [
    {
      productVariantId: "pv-1",
      returnedQty: 2,
      unitCost: 10000,
      reason: "DAMAGED" as const,
      notes: "test item",
    },
  ],
};

const mockDraftReturn = {
  id: "ret-1",
  returnNumber: "PR-20260503-0001",
  purchaseOrderId: "po-1",
  goodsReceiptId: "gr-1",
  supplierId: "sup-1",
  sourceLocationId: "loc-1",
  reason: "Damaged items",
  notes: "test",
  totalAmount: 20000,
  status: PurchaseReturnStatus.DRAFT,
  createdById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockConfirmedReturn = {
  ...mockDraftReturn,
  status: PurchaseReturnStatus.CONFIRMED,
};

const mockShippedReturn = {
  ...mockDraftReturn,
  status: PurchaseReturnStatus.SHIPPED,
};

const mockCompletedReturn = {
  ...mockDraftReturn,
  status: PurchaseReturnStatus.COMPLETED,
};

const mockCancelledReturn = {
  ...mockDraftReturn,
  status: PurchaseReturnStatus.CANCELLED,
};

describe("PurchaseReturnService.isReturnNumberConflict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for null error", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue(
      null as never,
    );
    vi.mocked(mockPrisma.purchaseReturn.create).mockResolvedValue(
      mockDraftReturn as never,
    );

    await PurchaseReturnService.createReturn(createInput, "user-1");

    // No collision means it succeeds on first attempt
    expect(mockPrisma.purchaseReturn.create).toHaveBeenCalledTimes(1);
  });

  it("returns false for non-object error", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue({
      returnNumber: "PR-20260503-0001",
    } as never);
    vi.mocked(mockPrisma.purchaseReturn.create).mockRejectedValueOnce(
      "string error" as never,
    );

    await expect(
      PurchaseReturnService.createReturn(createInput, "user-1"),
    ).rejects.toThrow();
  });

  it("returns false for P2002 without meta.target", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue({
      returnNumber: "PR-20260503-0001",
    } as never);
    vi.mocked(mockPrisma.purchaseReturn.create).mockRejectedValueOnce({
      code: "P2002",
    } as never);

    await expect(
      PurchaseReturnService.createReturn(createInput, "user-1"),
    ).rejects.toThrow();
  });

  it("returns false for P2002 with non-matching string target", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue({
      returnNumber: "PR-20260503-0001",
    } as never);
    vi.mocked(mockPrisma.purchaseReturn.create).mockRejectedValueOnce({
      code: "P2002",
      meta: { target: "email" },
    } as never);

    await expect(
      PurchaseReturnService.createReturn(createInput, "user-1"),
    ).rejects.toThrow();
  });

  it("returns true for P2002 with string target containing returnNumber", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst)
      .mockResolvedValue({ returnNumber: "PR-20260503-0001" } as never)
      .mockResolvedValue({ returnNumber: "PR-20260503-0002" } as never);

    vi.mocked(mockPrisma.purchaseReturn.create)
      .mockRejectedValueOnce({
        code: "P2002",
        meta: { target: "returnNumber" },
      } as never)
      .mockResolvedValueOnce(mockDraftReturn as never);

    const result = await PurchaseReturnService.createReturn(
      createInput,
      "user-1",
    );

    expect(mockPrisma.purchaseReturn.create).toHaveBeenCalledTimes(2);
    expect(result.id).toBe("ret-1");
  });

  it("returns true for P2002 with array target containing returnNumber", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst)
      .mockResolvedValue({ returnNumber: "PR-20260503-0001" } as never)
      .mockResolvedValue({ returnNumber: "PR-20260503-0002" } as never);

    vi.mocked(mockPrisma.purchaseReturn.create)
      .mockRejectedValueOnce({
        code: "P2002",
        meta: { target: ["returnNumber"] },
      } as never)
      .mockResolvedValueOnce(mockDraftReturn as never);

    const result = await PurchaseReturnService.createReturn(
      createInput,
      "user-1",
    );

    expect(result.id).toBe("ret-1");
  });

  it("returns false for P2002 with array target not containing returnNumber", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue({
      returnNumber: "PR-20260503-0001",
    } as never);
    vi.mocked(mockPrisma.purchaseReturn.create).mockRejectedValueOnce({
      code: "P2002",
      meta: { target: ["email"] },
    } as never);

    await expect(
      PurchaseReturnService.createReturn(createInput, "user-1"),
    ).rejects.toThrow();
  });

  it("returns false for non-P2002 error code", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue({
      returnNumber: "PR-20260503-0001",
    } as never);
    vi.mocked(mockPrisma.purchaseReturn.create).mockRejectedValueOnce({
      code: "P2000",
    } as never);

    await expect(
      PurchaseReturnService.createReturn(createInput, "user-1"),
    ).rejects.toThrow();
  });
});

describe("PurchaseReturnService.generateReturnNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates first return number when no return exists for the day", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue(
      null as never,
    );

    const number = await PurchaseReturnService.generateReturnNumber();

    expect(number).toBe("PR-20260503-0001");
    expect(mockPrisma.purchaseReturn.findFirst).toHaveBeenCalledWith({
      where: { returnNumber: { startsWith: "PR-20260503-" } },
      orderBy: { returnNumber: "desc" },
    });
  });

  it("increments sequence from latest return number", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue({
      returnNumber: "PR-20260503-0042",
    } as never);

    const number = await PurchaseReturnService.generateReturnNumber();

    expect(number).toBe("PR-20260503-0043");
  });

  it("falls back to 0001 when existing sequence is invalid (NaN)", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue({
      returnNumber: "PR-20260503-ABCD",
    } as never);

    const number = await PurchaseReturnService.generateReturnNumber();

    expect(number).toBe("PR-20260503-0001");
  });

  it("falls back to 0001 when existing return number is malformed (no sequence part)", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue({
      returnNumber: "PR-20260503",
    } as never);

    const number = await PurchaseReturnService.generateReturnNumber();

    expect(number).toBe("PR-20260503-0001");
  });
});

describe("PurchaseReturnService.createReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates purchase return successfully on first attempt", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue(
      null as never,
    );
    vi.mocked(mockPrisma.purchaseReturn.create).mockResolvedValue({
      id: "ret-1",
      returnNumber: "PR-20260503-0001",
      totalAmount: 20000,
      status: PurchaseReturnStatus.DRAFT,
      items: [{ productVariantId: "pv-1", returnedQty: 2, unitCost: 10000 }],
    } as never);

    const result = await PurchaseReturnService.createReturn(
      createInput,
      "user-1",
    );

    expect(result.id).toBe("ret-1");
    expect(mockPrisma.purchaseReturn.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.purchaseReturn.create).toHaveBeenCalledWith({
      data: {
        returnNumber: "PR-20260503-0001",
        purchaseOrderId: "po-1",
        goodsReceiptId: "gr-1",
        supplierId: "sup-1",
        sourceLocationId: "loc-1",
        reason: "Damaged items",
        notes: "test",
        totalAmount: 20000,
        status: PurchaseReturnStatus.DRAFT,
        createdById: "user-1",
        items: {
          create: [
            {
              productVariantId: "pv-1",
              returnedQty: 2,
              unitCost: 10000,
              reason: "DAMAGED",
              notes: "test item",
            },
          ],
        },
      },
      include: { items: true },
    });
    expect(mockLogActivity).toHaveBeenCalledWith({
      userId: "user-1",
      action: "CREATE_PURCHASE_RETURN",
      entityType: "PurchaseReturn",
      entityId: "ret-1",
      details: "Created draft Purchase Return PR-20260503-0001",
    });
  });

  it("calculates totalAmount correctly with multiple items", async () => {
    const multiItemInput = {
      ...createInput,
      items: [
        {
          productVariantId: "pv-1",
          returnedQty: 2,
          unitCost: 10000,
          reason: "DAMAGED" as const,
          notes: "",
        },
        {
          productVariantId: "pv-2",
          returnedQty: 3,
          unitCost: 5000,
          reason: "DEFECT" as const,
          notes: "",
        },
      ],
    };

    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue(
      null as never,
    );
    vi.mocked(mockPrisma.purchaseReturn.create).mockResolvedValue({
      id: "ret-2",
      returnNumber: "PR-20260503-0001",
      items: [],
    } as never);

    await PurchaseReturnService.createReturn(multiItemInput, "user-1");

    expect(mockPrisma.purchaseReturn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 35000, // (2*10000) + (3*5000)
        }),
      }),
    );
  });

  it("retries on returnNumber collision and succeeds", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst)
      .mockResolvedValueOnce({ returnNumber: "PR-20260503-0001" } as never)
      .mockResolvedValueOnce({ returnNumber: "PR-20260503-0002" } as never);

    vi.mocked(mockPrisma.purchaseReturn.create)
      .mockRejectedValueOnce({
        code: "P2002",
        meta: { target: ["returnNumber"] },
      } as never)
      .mockResolvedValueOnce({
        id: "ret-1",
        returnNumber: "PR-20260503-0003",
        items: [],
      } as never);

    const result = await PurchaseReturnService.createReturn(
      createInput,
      "user-1",
    );

    expect(mockPrisma.purchaseReturn.create).toHaveBeenCalledTimes(2);
    expect(result.id).toBe("ret-1");
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Detected Purchase Return number collision, retrying createReturn",
      { module: "PurchaseReturnService", attempt: 1 },
    );
  });

  it("throws after exhausting maxAttempts on repeated collisions", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue({
      returnNumber: "PR-20260503-0001",
    } as never);

    vi.mocked(mockPrisma.purchaseReturn.create).mockRejectedValue({
      code: "P2002",
      meta: { target: ["returnNumber"] },
    } as never);

    await expect(
      PurchaseReturnService.createReturn(createInput, "user-1"),
    ).rejects.toThrow(
      "Failed to create Purchase Return due to repeated return number collisions",
    );

    expect(mockPrisma.purchaseReturn.create).toHaveBeenCalledTimes(3);
  });

  it("rethrows non-collision errors immediately", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findFirst).mockResolvedValue({
      returnNumber: "PR-20260503-0001",
    } as never);

    vi.mocked(mockPrisma.purchaseReturn.create).mockRejectedValueOnce(
      new Error("Database unavailable") as never,
    );

    await expect(
      PurchaseReturnService.createReturn(createInput, "user-1"),
    ).rejects.toThrow("Database unavailable");

    expect(mockPrisma.purchaseReturn.create).toHaveBeenCalledTimes(1);
  });
});

describe("PurchaseReturnService.updateReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when id is missing", async () => {
    await expect(
      PurchaseReturnService.updateReturn(
        { id: undefined, reason: "updated" } as never,
        "user-1",
      ),
    ).rejects.toThrow("Return ID is required");
  });

  it("throws when return not found", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(null);

    await expect(
      PurchaseReturnService.updateReturn({ id: "ret-1" } as any, "user-1"),
    ).rejects.toThrow("Purchase Return");
  });

  it("throws when return is not in DRAFT status", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockConfirmedReturn as never,
    );

    await expect(
      PurchaseReturnService.updateReturn({ id: "ret-1" } as any, "user-1"),
      ).rejects.toThrow("Can only update DRAFT returns");
  });

  it("updates return without items", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockDraftReturn as never,
    );
    vi.mocked(mockPrisma.purchaseReturn.update).mockResolvedValue({
      ...mockDraftReturn,
      reason: "Updated reason",
    } as never);

    const result = await PurchaseReturnService.updateReturn(
      { id: "ret-1", reason: "Updated reason" } as any,
      "user-1",
    );

    expect(result.reason).toBe("Updated reason");
    expect(mockPrisma.purchaseReturn.update).toHaveBeenCalledWith({
      where: { id: "ret-1" },
      data: expect.objectContaining({
        reason: "Updated reason",
      }),
    });
    expect(mockLogActivity).toHaveBeenCalledWith({
      userId: "user-1",
      action: "UPDATE_PURCHASE_RETURN",
      entityType: "PurchaseReturn",
      entityId: "ret-1",
      details: expect.stringContaining("Updated Purchase Return"),
    });
  });

  it("updates return with items and recalculates totalAmount", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockDraftReturn as never,
    );
    vi.mocked(mockPrisma.purchaseReturn.update).mockResolvedValue({
      ...mockDraftReturn,
      totalAmount: 50000,
    } as never);

    const items = [
      {
        productVariantId: "pv-1",
        returnedQty: 5,
        unitCost: 10000,
        reason: "DEFECT" as const,
        notes: "",
      },
    ];

    const result = await PurchaseReturnService.updateReturn(
      { id: "ret-1", items } as any,
      "user-1",
    );

    expect(result.totalAmount).toBe(50000);
    expect(mockPrisma.purchaseReturn.update).toHaveBeenCalledWith({
      where: { id: "ret-1" },
      data: expect.objectContaining({
        totalAmount: 50000,
        items: {
          deleteMany: {},
          create: [
            {
              productVariantId: "pv-1",
              returnedQty: 5,
              unitCost: 10000,
              reason: "DEFECT",
              notes: "",
            },
          ],
        },
      }),
    });
  });

  it("preserves existing totalAmount when items not provided", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockDraftReturn as never,
    );
    vi.mocked(mockPrisma.purchaseReturn.update).mockResolvedValue(
      mockDraftReturn as never,
    );

    await PurchaseReturnService.updateReturn(
      { id: "ret-1", notes: "just notes" } as any,
      "user-1",
    );

    expect(mockPrisma.purchaseReturn.update).toHaveBeenCalledWith({
      where: { id: "ret-1" },
      data: expect.not.objectContaining({
        totalAmount: expect.anything(),
      }),
    });
  });
});

describe("PurchaseReturnService.confirmReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when return not found", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(null);

    await expect(
      PurchaseReturnService.confirmReturn("ret-1", "user-1"),
    ).rejects.toThrow("Purchase Return");
  });

  it("throws when return is not in DRAFT status", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockConfirmedReturn as never,
    );

    await expect(
      PurchaseReturnService.confirmReturn("ret-1", "user-1"),
    ).rejects.toThrow("Only DRAFT returns can be confirmed");
  });

  it("confirms a draft return successfully", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockDraftReturn as never,
    );
    vi.mocked(mockPrisma.purchaseReturn.update).mockResolvedValue(
      mockConfirmedReturn as never,
    );

    const result = await PurchaseReturnService.confirmReturn("ret-1", "user-1");

    expect(result.status).toBe(PurchaseReturnStatus.CONFIRMED);
    expect(mockPrisma.purchaseReturn.update).toHaveBeenCalledWith({
      where: { id: "ret-1" },
      data: { status: PurchaseReturnStatus.CONFIRMED },
    });
    expect(mockLogActivity).toHaveBeenCalledWith({
      userId: "user-1",
      action: "CONFIRM_PURCHASE_RETURN",
      entityType: "PurchaseReturn",
      entityId: "ret-1",
      details: "Confirmed Purchase Return PR-20260503-0001",
    });
  });
});

describe("PurchaseReturnService.shipReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when return not found", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(null);

    await expect(
      PurchaseReturnService.shipReturn("ret-1", "user-1"),
    ).rejects.toThrow("Purchase Return");
  });

  it("throws when return is not in CONFIRMED status", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockDraftReturn as never,
    );

    await expect(
      PurchaseReturnService.shipReturn("ret-1", "user-1"),
    ).rejects.toThrow("Only CONFIRMED returns can be shipped");
  });

  it("ships a confirmed return successfully and triggers auto-journal", async () => {
    const mockReturnWithItems = {
      ...mockConfirmedReturn,
      items: [{ productVariantId: "pv-1", returnedQty: 2, unitCost: 10000 }],
      purchaseOrder: { orderNumber: "PO-001" },
    };

    vi.mocked(mockPrisma.purchaseReturn.findUnique)
      .mockResolvedValueOnce(mockReturnWithItems as never)
      .mockResolvedValueOnce({ ...mockShippedReturn, items: [] } as never);

    const mockTx = {
      purchaseReturn: { update: vi.fn().mockResolvedValue(mockShippedReturn) },
      inventory: { upsert: vi.fn().mockResolvedValue({}) },
      stockMovement: { createMany: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(mockPrisma.$transaction).mockImplementation(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mockTx),
    );

    mockAutoJournal.handlePurchaseReturnShipped.mockResolvedValue(undefined);

    const result = await PurchaseReturnService.shipReturn("ret-1", "user-1");

    expect(mockTx.purchaseReturn.update).toHaveBeenCalledWith({
      where: { id: "ret-1" },
      data: { status: PurchaseReturnStatus.SHIPPED },
    });
    expect(mockTx.inventory.upsert).toHaveBeenCalledWith({
      where: {
        locationId_productVariantId: {
          locationId: "loc-1",
          productVariantId: "pv-1",
        },
      },
      update: { quantity: { decrement: 2 } },
      create: {
        locationId: "loc-1",
        productVariantId: "pv-1",
        quantity: 0,
      },
    });
    expect(mockTx.stockMovement.createMany).toHaveBeenCalledWith({
      data: [
        {
          productVariantId: "pv-1",
          fromLocationId: "loc-1",
          toLocationId: null,
          quantity: 2,
          type: MovementType.RETURN_OUT,
          reference: "PR-20260503-0001",
          createdById: "user-1",
        },
      ],
    });
    expect(mockLogActivity).toHaveBeenCalledWith({
      userId: "user-1",
      action: "SHIP_PURCHASE_RETURN",
      entityType: "PurchaseReturn",
      entityId: "ret-1",
      details: "Shipped items for Purchase Return PR-20260503-0001",
      tx: mockTx,
    });
    expect(mockAutoJournal.handlePurchaseReturnShipped).toHaveBeenCalledWith(
      "ret-1",
    );
    expect(result).toBeDefined();
  });

  it("ships with multiple items", async () => {
    const mockReturnWithItems = {
      ...mockConfirmedReturn,
      items: [
        { productVariantId: "pv-1", returnedQty: 2, unitCost: 10000 },
        { productVariantId: "pv-2", returnedQty: 5, unitCost: 5000 },
      ],
      purchaseOrder: { orderNumber: "PO-001" },
    };

    vi.mocked(mockPrisma.purchaseReturn.findUnique)
      .mockResolvedValueOnce(mockReturnWithItems as never)
      .mockResolvedValueOnce({ ...mockShippedReturn, items: [] } as never);

    const mockTx = {
      purchaseReturn: { update: vi.fn().mockResolvedValue(mockShippedReturn) },
      inventory: { upsert: vi.fn().mockResolvedValue({}) },
      stockMovement: { createMany: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(mockPrisma.$transaction).mockImplementation(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mockTx),
    );

    await PurchaseReturnService.shipReturn("ret-1", "user-1");

    expect(mockTx.inventory.upsert).toHaveBeenCalledTimes(2);
    expect(mockTx.stockMovement.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ productVariantId: "pv-1", quantity: 2 }),
        expect.objectContaining({ productVariantId: "pv-2", quantity: 5 }),
      ]),
    });
  });

  it("continues when auto-journal fails", async () => {
    const mockReturnWithItems = {
      ...mockConfirmedReturn,
      items: [{ productVariantId: "pv-1", returnedQty: 2, unitCost: 10000 }],
      purchaseOrder: { orderNumber: "PO-001" },
    };

    vi.mocked(mockPrisma.purchaseReturn.findUnique)
      .mockResolvedValueOnce(mockReturnWithItems as never)
      .mockResolvedValueOnce({ ...mockShippedReturn, items: [] } as never);

    const mockTx = {
      purchaseReturn: { update: vi.fn().mockResolvedValue(mockShippedReturn) },
      inventory: { upsert: vi.fn().mockResolvedValue({}) },
      stockMovement: { createMany: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(mockPrisma.$transaction).mockImplementation(async (cb) =>
      (cb as (tx: unknown) => Promise<unknown>)(mockTx),
    );

    mockAutoJournal.handlePurchaseReturnShipped.mockRejectedValue(
      new Error("Journal service unavailable"),
    );

    const result = await PurchaseReturnService.shipReturn("ret-1", "user-1");

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to generate auto-journal for Purchase Return",
      expect.objectContaining({
        returnId: "ret-1",
        module: "PurchaseReturnService",
      }),
    );
    expect(result).toBeDefined();
  });
});

describe("PurchaseReturnService.completeReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when return not found", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(null);

    await expect(
      PurchaseReturnService.completeReturn("ret-1", "user-1"),
    ).rejects.toThrow("Purchase Return");
  });

  it("throws when return is not in SHIPPED status", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockConfirmedReturn as never,
    );

    await expect(
      PurchaseReturnService.completeReturn("ret-1", "user-1"),
    ).rejects.toThrow("Only SHIPPED returns can be completed");
  });

  it("completes a shipped return successfully", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockShippedReturn as never,
    );
    vi.mocked(mockPrisma.purchaseReturn.update).mockResolvedValue(
      mockCompletedReturn as never,
    );

    const result = await PurchaseReturnService.completeReturn(
      "ret-1",
      "user-1",
    );

    expect(result.status).toBe(PurchaseReturnStatus.COMPLETED);
    expect(mockPrisma.purchaseReturn.update).toHaveBeenCalledWith({
      where: { id: "ret-1" },
      data: { status: PurchaseReturnStatus.COMPLETED },
    });
    expect(mockLogActivity).toHaveBeenCalledWith({
      userId: "user-1",
      action: "COMPLETE_PURCHASE_RETURN",
      entityType: "PurchaseReturn",
      entityId: "ret-1",
      details: "Completed Purchase Return PR-20260503-0001",
    });
  });
});

describe("PurchaseReturnService.cancelReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when return not found", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(null);

    await expect(
      PurchaseReturnService.cancelReturn("ret-1", "user-1"),
    ).rejects.toThrow("Purchase Return");
  });

  it("throws when return is SHIPPED", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockShippedReturn as never,
    );

    await expect(
      PurchaseReturnService.cancelReturn("ret-1", "user-1"),
    ).rejects.toThrow(
      "Cannot cancel returns that are already processing or completed",
    );
  });

  it("throws when return is COMPLETED", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockCompletedReturn as never,
    );

    await expect(
      PurchaseReturnService.cancelReturn("ret-1", "user-1"),
    ).rejects.toThrow(
      "Cannot cancel returns that are already processing or completed",
    );
  });

  it("cancels a draft return successfully", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockDraftReturn as never,
    );
    vi.mocked(mockPrisma.purchaseReturn.update).mockResolvedValue(
      mockCancelledReturn as never,
    );

    const result = await PurchaseReturnService.cancelReturn("ret-1", "user-1");

    expect(result.status).toBe(PurchaseReturnStatus.CANCELLED);
    expect(mockPrisma.purchaseReturn.update).toHaveBeenCalledWith({
      where: { id: "ret-1" },
      data: { status: PurchaseReturnStatus.CANCELLED },
    });
    expect(mockLogActivity).toHaveBeenCalledWith({
      userId: "user-1",
      action: "CANCEL_PURCHASE_RETURN",
      entityType: "PurchaseReturn",
      entityId: "ret-1",
      details: "Cancelled Purchase Return PR-20260503-0001",
    });
  });

  it("cancels a confirmed return successfully", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockConfirmedReturn as never,
    );
    vi.mocked(mockPrisma.purchaseReturn.update).mockResolvedValue(
      mockCancelledReturn as never,
    );

    const result = await PurchaseReturnService.cancelReturn("ret-1", "user-1");

    expect(result.status).toBe(PurchaseReturnStatus.CANCELLED);
  });
});

describe("PurchaseReturnService.getReturns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all returns with no filters", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findMany).mockResolvedValue([
      mockDraftReturn,
    ] as never);

    const result = await PurchaseReturnService.getReturns();

    expect(result).toHaveLength(1);
    expect(mockPrisma.purchaseReturn.findMany).toHaveBeenCalledWith({
      where: {},
      include: {
        supplier: true,
        purchaseOrder: { select: { orderNumber: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it("filters by status", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findMany).mockResolvedValue([
      mockDraftReturn,
    ] as never);

    await PurchaseReturnService.getReturns({
      status: PurchaseReturnStatus.DRAFT,
    });

    expect(mockPrisma.purchaseReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: PurchaseReturnStatus.DRAFT },
      }),
    );
  });

  it("filters by supplierId", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findMany).mockResolvedValue(
      [] as never,
    );

    await PurchaseReturnService.getReturns({ supplierId: "sup-1" });

    expect(mockPrisma.purchaseReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { supplierId: "sup-1" },
      }),
    );
  });

  it("filters by search term", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findMany).mockResolvedValue(
      [] as never,
    );

    await PurchaseReturnService.getReturns({ search: "test" });

    expect(mockPrisma.purchaseReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { returnNumber: { contains: "test", mode: "insensitive" } },
            {
              purchaseOrder: {
                orderNumber: { contains: "test", mode: "insensitive" },
              },
            },
          ],
        },
      }),
    );
  });

  it("combines multiple filters", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findMany).mockResolvedValue(
      [] as never,
    );

    await PurchaseReturnService.getReturns({
      status: PurchaseReturnStatus.DRAFT,
      supplierId: "sup-1",
      search: "test",
    });

    expect(mockPrisma.purchaseReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: PurchaseReturnStatus.DRAFT,
          supplierId: "sup-1",
          OR: [
            { returnNumber: { contains: "test", mode: "insensitive" } },
            {
              purchaseOrder: {
                orderNumber: { contains: "test", mode: "insensitive" },
              },
            },
          ],
        },
      }),
    );
  });
});

describe("PurchaseReturnService.getReturnById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns purchase return with all relations", async () => {
    const mockFullReturn = {
      ...mockDraftReturn,
      supplier: { id: "sup-1", name: "Supplier A" },
      purchaseOrder: { id: "po-1", orderNumber: "PO-001" },
      goodsReceipt: { id: "gr-1" },
      sourceLocation: { id: "loc-1", name: "Warehouse" },
      createdBy: { name: "User 1" },
      items: [
        {
          id: "item-1",
          productVariant: {
            id: "pv-1",
            product: { id: "prod-1", name: "Product A" },
          },
        },
      ],
    };

    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(
      mockFullReturn as never,
    );

    const result = await PurchaseReturnService.getReturnById("ret-1");

    expect(result).toEqual(mockFullReturn);
    expect(mockPrisma.purchaseReturn.findUnique).toHaveBeenCalledWith({
      where: { id: "ret-1" },
      include: {
        supplier: true,
        purchaseOrder: true,
        goodsReceipt: true,
        sourceLocation: true,
        createdBy: { select: { name: true } },
        items: {
          include: {
            productVariant: {
              include: { product: true },
            },
          },
        },
      },
    });
  });

  it("returns null when return not found", async () => {
    vi.mocked(mockPrisma.purchaseReturn.findUnique).mockResolvedValue(null);

    const result = await PurchaseReturnService.getReturnById("nonexistent");

    expect(result).toBeNull();
  });
});
