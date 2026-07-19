import { describe, it, expect, vi, beforeEach } from "vitest";

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

  it("returns early when no target users (admin or sales)", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        dueDate: new Date("2026-01-01"),
        totalAmount: { toNumber: () => 1000 },
        paidAmount: { toNumber: () => 0 },
        salesOrder: { orderNumber: "SO-001", createdById: "sales-1" },
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    await checkOverdueSalesInvoices();

    expect(NotificationService.createBulkNotifications).not.toHaveBeenCalled();
  });

  it("creates notifications for admin users", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        dueDate: new Date("2026-01-01"),
        totalAmount: { toNumber: () => 1000 },
        paidAmount: { toNumber: () => 200 },
        salesOrder: { orderNumber: "SO-001", createdById: "sales-1" },
      },
    ] as never);
    // First call: admin users, second call: sales users
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce([{ id: "admin-1" }] as never)
      .mockResolvedValueOnce([{ id: "sales-1" }] as never);

    await checkOverdueSalesInvoices();

    expect(NotificationService.createBulkNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "admin-1",
          type: "OVERDUE_AR",
          entityType: "Invoice",
          entityId: "inv-1",
        }),
        expect.objectContaining({
          userId: "sales-1",
          type: "OVERDUE_AR",
          entityType: "Invoice",
          entityId: "inv-1",
        }),
      ]),
    );
  });

  it("deduplicates admin who also owns overdue orders", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        dueDate: new Date("2026-01-01"),
        totalAmount: { toNumber: () => 1000 },
        paidAmount: { toNumber: () => 0 },
        salesOrder: { orderNumber: "SO-001", createdById: "admin-1" },
      },
    ] as never);
    // admin-1 is both ADMIN and the sales person
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce([{ id: "admin-1" }] as never)
      .mockResolvedValueOnce([{ id: "admin-1" }] as never);

    await checkOverdueSalesInvoices();

    // Should only create ONE notification for admin-1, not two
    const calls = vi.mocked(NotificationService.createBulkNotifications).mock.calls[0][0];
    const adminNotifications = calls.filter((n: { userId: string }) => n.userId === "admin-1");
    expect(adminNotifications).toHaveLength(1);
  });

  it("uses Indonesian message and sales link", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        dueDate: new Date("2026-01-15"),
        totalAmount: { toNumber: () => 5000000 },
        paidAmount: { toNumber: () => 1000000 },
        salesOrder: { orderNumber: "SO-001", createdById: "sales-1" },
      },
    ] as never);
    vi.mocked(prisma.user.findMany)
      .mockResolvedValueOnce([{ id: "admin-1" }] as never)
      .mockResolvedValueOnce([{ id: "sales-1" }] as never);

    await checkOverdueSalesInvoices();

    expect(NotificationService.createBulkNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Invoice Jatuh Tempo",
          link: "/sales/invoices/inv-1",
          message: expect.stringContaining("INV-001"),
        }),
      ]),
    );
  });
});
