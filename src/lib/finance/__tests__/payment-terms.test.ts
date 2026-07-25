import { describe, it, expect } from "vitest";
import { addDays, subDays } from "date-fns";
import {
  isInvoiceOverdue,
  calculateDueDate,
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
