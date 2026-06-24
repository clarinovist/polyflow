import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/finance/invoice-lifecycle-service", () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue("INV-2026-00001"),
  createInvoice: vi.fn().mockResolvedValue({ id: "inv-1" }),
  updateInvoiceStatus: vi.fn().mockResolvedValue({ id: "inv-1" }),
  createDraftInvoiceFromOrder: vi.fn().mockResolvedValue({ id: "inv-2" }),
}));

vi.mock("@/services/finance/invoice-overdue-service", () => ({
  checkOverdueSalesInvoices: vi.fn().mockResolvedValue(undefined),
}));

import {
  generateInvoiceNumber,
  createInvoice,
  updateInvoiceStatus,
  createDraftInvoiceFromOrder,
} from "@/services/finance/invoice-lifecycle-service";
import { checkOverdueSalesInvoices } from "@/services/finance/invoice-overdue-service";
import { InvoiceService } from "@/services/finance/invoice-service";

describe("InvoiceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates generateInvoiceNumber", async () => {
    const result = await InvoiceService.generateInvoiceNumber();
    expect(generateInvoiceNumber).toHaveBeenCalled();
    expect(result).toBe("INV-2026-00001");
  });

  it("delegates createInvoice", async () => {
    const data = { lines: [] } as never;
    const result = await InvoiceService.createInvoice(data, "user-1");
    expect(createInvoice).toHaveBeenCalledWith(data, "user-1");
    expect(result).toEqual({ id: "inv-1" });
  });

  it("delegates updateStatus", async () => {
    const data = { id: "inv-1", status: "PAID" } as never;
    const result = await InvoiceService.updateStatus(data, "user-1");
    expect(updateInvoiceStatus).toHaveBeenCalledWith(data, "user-1");
    expect(result).toEqual({ id: "inv-1" });
  });

  it("delegates createDraftInvoiceFromOrder", async () => {
    const result = await InvoiceService.createDraftInvoiceFromOrder(
      "so-1",
      "user-1",
    );
    expect(createDraftInvoiceFromOrder).toHaveBeenCalledWith("so-1", "user-1");
    expect(result).toEqual({ id: "inv-2" });
  });

  it("delegates checkOverdueSalesInvoices", async () => {
    await InvoiceService.checkOverdueSalesInvoices();
    expect(checkOverdueSalesInvoices).toHaveBeenCalled();
  });
});
