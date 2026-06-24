import { describe, it, expect, vi, beforeEach } from "vitest";
import { InvoiceStatus } from "@prisma/client";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    invoice: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("@/services/core/notification-service", () => ({
  NotificationService: {
    createBulkNotifications: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from "@/lib/core/prisma";
import { NotificationService } from "@/services/core/notification-service";
import { checkOverdueSalesInvoices } from "@/services/finance/invoice-overdue-service";

describe("checkOverdueSalesInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when no overdue invoices", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);

    await checkOverdueSalesInvoices();

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(NotificationService.createBulkNotifications).not.toHaveBeenCalled();
  });

  it("returns early when no admin users", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        dueDate: new Date("2026-01-01"),
        totalAmount: { toNumber: () => 1000 },
        paidAmount: { toNumber: () => 0 },
        salesOrder: { orderNumber: "SO-001" },
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    await checkOverdueSalesInvoices();

    expect(NotificationService.createBulkNotifications).not.toHaveBeenCalled();
  });

  it("creates bulk notifications for overdue invoices", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        dueDate: new Date("2026-01-01"),
        totalAmount: { toNumber: () => 1000 },
        paidAmount: { toNumber: () => 200 },
        salesOrder: { orderNumber: "SO-001" },
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "user-1" },
    ] as never);

    await checkOverdueSalesInvoices();

    expect(NotificationService.createBulkNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "user-1",
          type: "OVERDUE_AR",
          entityType: "Invoice",
          entityId: "inv-1",
        }),
      ]),
    );
  });

  it("creates notifications for multiple invoices and users", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        dueDate: new Date("2026-01-01"),
        totalAmount: { toNumber: () => 500 },
        paidAmount: { toNumber: () => 0 },
        salesOrder: { orderNumber: "SO-001" },
      },
      {
        id: "inv-2",
        invoiceNumber: "INV-002",
        dueDate: new Date("2026-01-05"),
        totalAmount: { toNumber: () => 800 },
        paidAmount: { toNumber: () => 100 },
        salesOrder: { orderNumber: "SO-002" },
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "user-1" },
      { id: "user-2" },
    ] as never);

    await checkOverdueSalesInvoices();

    expect(NotificationService.createBulkNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ entityId: "inv-1", userId: "user-1" }),
        expect.objectContaining({ entityId: "inv-1", userId: "user-2" }),
        expect.objectContaining({ entityId: "inv-2", userId: "user-1" }),
        expect.objectContaining({ entityId: "inv-2", userId: "user-2" }),
      ]),
    );
  });
});
