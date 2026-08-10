import { describe, it, expect } from "vitest";
import { addDays, subDays } from "date-fns";
import {
  isInvoiceOverdue,
  calculateDueDate,
  getInvoiceRemainingAmount,
  isActionableInvoiceOverdue,
} from "@/lib/finance/payment-terms";

describe("isInvoiceOverdue", () => {
  it("should return false when status is PAID, CANCELLED, or DRAFT even if past due date", () => {
    const pastDate = subDays(new Date(), 10);
    expect(isInvoiceOverdue(pastDate, "PAID")).toBe(false);
    expect(isInvoiceOverdue(pastDate, "CANCELLED")).toBe(false);
    expect(isInvoiceOverdue(pastDate, "DRAFT")).toBe(false);
  });

  it("should return true when status is OVERDUE regardless of due date", () => {
    const futureDate = addDays(new Date(), 10);
    expect(isInvoiceOverdue(futureDate, "OVERDUE")).toBe(true);
    expect(isInvoiceOverdue(null, "OVERDUE")).toBe(true);
  });

  it("should return true when UNPAID or PARTIAL and due date is in the past", () => {
    const pastDate = subDays(new Date(), 5);
    expect(isInvoiceOverdue(pastDate, "UNPAID")).toBe(true);
    expect(isInvoiceOverdue(pastDate, "PARTIAL")).toBe(true);
  });

  it("should return false when UNPAID or PARTIAL and due date is in the future", () => {
    const futureDate = addDays(new Date(), 5);
    expect(isInvoiceOverdue(futureDate, "UNPAID")).toBe(false);
    expect(isInvoiceOverdue(futureDate, "PARTIAL")).toBe(false);
  });

  it("should return false when dueDate or status is missing", () => {
    expect(isInvoiceOverdue(null, "UNPAID")).toBe(false);
    expect(isInvoiceOverdue(subDays(new Date(), 5), null)).toBe(false);
    expect(isInvoiceOverdue(undefined, undefined)).toBe(false);
  });
});

describe("isActionableInvoiceOverdue", () => {
  it("returns true only for due, outstanding AR statuses", () => {
    const referenceDate = new Date("2026-08-10T12:00:00Z");

    expect(
      isActionableInvoiceOverdue(
        {
          dueDate: "2026-08-09T00:00:00Z",
          status: "UNPAID",
          totalAmount: 1000,
          paidAmount: 250,
        },
        referenceDate,
      ),
    ).toBe(true);
  });

  it("excludes invoices that are fully paid even when status is stale overdue", () => {
    const referenceDate = new Date("2026-08-10T12:00:00Z");

    expect(
      isActionableInvoiceOverdue(
        {
          dueDate: "2026-08-01T00:00:00Z",
          status: "OVERDUE",
          totalAmount: 1000,
          paidAmount: 1000,
        },
        referenceDate,
      ),
    ).toBe(false);
  });

  it("requires due date to be before the reference day", () => {
    const referenceDate = new Date("2026-08-10T12:00:00Z");

    expect(
      isActionableInvoiceOverdue(
        {
          dueDate: "2026-08-10T00:00:00Z",
          status: "OVERDUE",
          totalAmount: 1000,
          paidAmount: 0,
        },
        referenceDate,
      ),
    ).toBe(false);
  });
});

describe("getInvoiceRemainingAmount", () => {
  it("never returns a negative remaining amount", () => {
    expect(getInvoiceRemainingAmount(1000, 1200)).toBe(0);
  });
});

describe("calculateDueDate", () => {
  it("should calculate due date correctly", () => {
    const invoiceDate = new Date("2026-01-01T00:00:00Z");
    const dueDate = calculateDueDate(invoiceDate, 30);
    expect(dueDate.toISOString().startsWith("2026-01-31")).toBe(true);
  });

  it("should fallback to 0 days if term is invalid", () => {
    const invoiceDate = new Date("2026-01-01T00:00:00Z");
    const dueDate = calculateDueDate(invoiceDate, -5);
    expect(dueDate.getTime()).toBe(invoiceDate.getTime());
  });
});
