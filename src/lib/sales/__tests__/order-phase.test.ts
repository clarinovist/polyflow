import { describe, it, expect } from "vitest";
import {
  canTransition,
  ORDER_TRANSITIONS,
  isQuotationPhase,
  isPreConfirm,
  isOperational,
  isTerminal,
  canConfirm,
  canCreateDelivery,
  canCreateInvoice,
  canEdit,
  canSendQuotation,
  canAcceptQuotation,
  canReopenQuotation,
  countsTowardRevenue,
  appearsInFGDemand,
  getOrderPhaseLabel,
  QUOTATION_STATUSES,
  PRE_CONFIRM_STATUSES,
  OPERATIONAL_STATUSES,
  TERMINAL_STATUSES,
  REVENUE_STATUSES,
} from "../order-phase";

// Cast string literals to SalesOrderStatus for test convenience
const S = (v: string) => v as never;

describe("order-phase", () => {
  describe("status sets", () => {
    it("QUOTATION_STATUSES contains 4 quotation-phase statuses", () => {
      expect(QUOTATION_STATUSES).toEqual([
        "QUOTATION",
        "QUOTATION_SENT",
        "QUOTATION_REJECTED",
        "QUOTATION_EXPIRED",
      ]);
    });

    it("PRE_CONFIRM_STATUSES includes quotation + DRAFT", () => {
      expect(PRE_CONFIRM_STATUSES).toContain("QUOTATION");
      expect(PRE_CONFIRM_STATUSES).toContain("QUOTATION_SENT");
      expect(PRE_CONFIRM_STATUSES).toContain("DRAFT");
      expect(PRE_CONFIRM_STATUSES).not.toContain("CONFIRMED");
    });

    it("OPERATIONAL_STATUSES starts at CONFIRMED", () => {
      expect(OPERATIONAL_STATUSES).toContain("CONFIRMED");
      expect(OPERATIONAL_STATUSES).toContain("DELIVERED");
      expect(OPERATIONAL_STATUSES).not.toContain("DRAFT");
      expect(OPERATIONAL_STATUSES).not.toContain("QUOTATION");
    });

    it("TERMINAL_STATUSES includes rejected, expired, cancelled", () => {
      expect(TERMINAL_STATUSES).toContain("QUOTATION_REJECTED");
      expect(TERMINAL_STATUSES).toContain("QUOTATION_EXPIRED");
      expect(TERMINAL_STATUSES).toContain("CANCELLED");
      expect(TERMINAL_STATUSES).not.toContain("DRAFT");
    });

    it("REVENUE_STATUSES only SHIPPED and DELIVERED", () => {
      expect(REVENUE_STATUSES).toEqual(["SHIPPED", "DELIVERED"]);
    });
  });

  describe("isQuotationPhase", () => {
    it("returns true for QUOTATION", () => {
      expect(isQuotationPhase(S("QUOTATION"))).toBe(true);
    });
    it("returns true for QUOTATION_SENT", () => {
      expect(isQuotationPhase(S("QUOTATION_SENT"))).toBe(true);
    });
    it("returns true for QUOTATION_REJECTED", () => {
      expect(isQuotationPhase(S("QUOTATION_REJECTED"))).toBe(true);
    });
    it("returns true for QUOTATION_EXPIRED", () => {
      expect(isQuotationPhase(S("QUOTATION_EXPIRED"))).toBe(true);
    });
    it("returns false for DRAFT", () => {
      expect(isQuotationPhase(S("DRAFT"))).toBe(false);
    });
    it("returns false for CONFIRMED", () => {
      expect(isQuotationPhase(S("CONFIRMED"))).toBe(false);
    });
    it("returns false for CANCELLED", () => {
      expect(isQuotationPhase(S("CANCELLED"))).toBe(false);
    });
  });

  describe("isPreConfirm", () => {
    it("returns true for all quotation statuses", () => {
      expect(isPreConfirm(S("QUOTATION"))).toBe(true);
      expect(isPreConfirm(S("QUOTATION_SENT"))).toBe(true);
      expect(isPreConfirm(S("DRAFT"))).toBe(true);
    });
    it("returns false for CONFIRMED", () => {
      expect(isPreConfirm(S("CONFIRMED"))).toBe(false);
    });
  });

  describe("isOperational", () => {
    it("returns true for CONFIRMED through DELIVERED", () => {
      expect(isOperational(S("CONFIRMED"))).toBe(true);
      expect(isOperational(S("IN_PRODUCTION"))).toBe(true);
      expect(isOperational(S("READY_TO_SHIP"))).toBe(true);
      expect(isOperational(S("SHIPPED"))).toBe(true);
      expect(isOperational(S("DELIVERED"))).toBe(true);
    });
    it("returns false for DRAFT and quotation statuses", () => {
      expect(isOperational(S("DRAFT"))).toBe(false);
      expect(isOperational(S("QUOTATION"))).toBe(false);
      expect(isOperational(S("CANCELLED"))).toBe(false);
    });
  });

  describe("isTerminal", () => {
    it("returns true for terminal statuses", () => {
      expect(isTerminal(S("QUOTATION_REJECTED"))).toBe(true);
      expect(isTerminal(S("QUOTATION_EXPIRED"))).toBe(true);
      expect(isTerminal(S("CANCELLED"))).toBe(true);
    });
    it("returns false for active statuses", () => {
      expect(isTerminal(S("DRAFT"))).toBe(false);
      expect(isTerminal(S("CONFIRMED"))).toBe(false);
      expect(isTerminal(S("QUOTATION"))).toBe(false);
    });
  });

  describe("action gates", () => {
    it("canConfirm only from DRAFT", () => {
      expect(canConfirm(S("DRAFT"))).toBe(true);
      expect(canConfirm(S("QUOTATION"))).toBe(false);
      expect(canConfirm(S("CONFIRMED"))).toBe(false);
    });

    it("canCreateDelivery only from operational", () => {
      expect(canCreateDelivery(S("CONFIRMED"))).toBe(true);
      expect(canCreateDelivery(S("SHIPPED"))).toBe(true);
      expect(canCreateDelivery(S("DRAFT"))).toBe(false);
      expect(canCreateDelivery(S("QUOTATION"))).toBe(false);
    });

    it("canCreateInvoice only from operational", () => {
      expect(canCreateInvoice(S("CONFIRMED"))).toBe(true);
      expect(canCreateInvoice(S("DRAFT"))).toBe(false);
      expect(canCreateInvoice(S("QUOTATION"))).toBe(false);
    });

    it("canEdit from QUOTATION, QUOTATION_SENT, DRAFT", () => {
      expect(canEdit(S("QUOTATION"))).toBe(true);
      expect(canEdit(S("QUOTATION_SENT"))).toBe(true);
      expect(canEdit(S("DRAFT"))).toBe(true);
      expect(canEdit(S("CONFIRMED"))).toBe(false);
      expect(canEdit(S("QUOTATION_REJECTED"))).toBe(false);
    });

    it("canSendQuotation only from QUOTATION", () => {
      expect(canSendQuotation(S("QUOTATION"))).toBe(true);
      expect(canSendQuotation(S("QUOTATION_SENT"))).toBe(false);
      expect(canSendQuotation(S("DRAFT"))).toBe(false);
    });

    it("canAcceptQuotation from QUOTATION or QUOTATION_SENT", () => {
      expect(canAcceptQuotation(S("QUOTATION"))).toBe(true);
      expect(canAcceptQuotation(S("QUOTATION_SENT"))).toBe(true);
      expect(canAcceptQuotation(S("DRAFT"))).toBe(false);
      expect(canAcceptQuotation(S("QUOTATION_REJECTED"))).toBe(false);
    });

    it("canReopenQuotation from REJECTED or EXPIRED", () => {
      expect(canReopenQuotation(S("QUOTATION_REJECTED"))).toBe(true);
      expect(canReopenQuotation(S("QUOTATION_EXPIRED"))).toBe(true);
      expect(canReopenQuotation(S("QUOTATION"))).toBe(false);
      expect(canReopenQuotation(S("DRAFT"))).toBe(false);
    });

    it("countsTowardRevenue only SHIPPED/DELIVERED", () => {
      expect(countsTowardRevenue(S("SHIPPED"))).toBe(true);
      expect(countsTowardRevenue(S("DELIVERED"))).toBe(true);
      expect(countsTowardRevenue(S("CONFIRMED"))).toBe(false);
      expect(countsTowardRevenue(S("QUOTATION"))).toBe(false);
    });

    it("appearsInFGDemand from operational only", () => {
      expect(appearsInFGDemand(S("CONFIRMED"))).toBe(true);
      expect(appearsInFGDemand(S("QUOTATION"))).toBe(false);
      expect(appearsInFGDemand(S("DRAFT"))).toBe(false);
    });
  });

  describe("canTransition", () => {
    it("QUOTATION can go to QUOTATION_SENT, DRAFT, CANCELLED", () => {
      expect(canTransition(S("QUOTATION"), S("QUOTATION_SENT"))).toBe(true);
      expect(canTransition(S("QUOTATION"), S("DRAFT"))).toBe(true);
      expect(canTransition(S("QUOTATION"), S("CANCELLED"))).toBe(true);
    });

    it("QUOTATION cannot go to CONFIRMED directly", () => {
      expect(canTransition(S("QUOTATION"), S("CONFIRMED"))).toBe(false);
    });

    it("QUOTATION_SENT can accept → DRAFT", () => {
      expect(canTransition(S("QUOTATION_SENT"), S("DRAFT"))).toBe(true);
    });

    it("QUOTATION_SENT can reject", () => {
      expect(canTransition(S("QUOTATION_SENT"), S("QUOTATION_REJECTED"))).toBe(
        true,
      );
    });

    it("QUOTATION_SENT can expire", () => {
      expect(canTransition(S("QUOTATION_SENT"), S("QUOTATION_EXPIRED"))).toBe(
        true,
      );
    });

    it("REJECTED can reopen → QUOTATION", () => {
      expect(canTransition(S("QUOTATION_REJECTED"), S("QUOTATION"))).toBe(true);
    });

    it("EXPIRED can reopen → QUOTATION", () => {
      expect(canTransition(S("QUOTATION_EXPIRED"), S("QUOTATION"))).toBe(true);
    });

    it("REJECTED cannot go to DRAFT", () => {
      expect(canTransition(S("QUOTATION_REJECTED"), S("DRAFT"))).toBe(false);
    });

    it("DRAFT can confirm (CONFIRMED or IN_PRODUCTION)", () => {
      expect(canTransition(S("DRAFT"), S("CONFIRMED"))).toBe(true);
      expect(canTransition(S("DRAFT"), S("IN_PRODUCTION"))).toBe(true);
    });

    it("DELIVERED has no outgoing transitions", () => {
      for (const target of Object.keys(ORDER_TRANSITIONS)) {
        expect(canTransition(S("DELIVERED"), S(target))).toBe(false);
      }
    });

    it("CANCELLED has no outgoing transitions", () => {
      for (const target of Object.keys(ORDER_TRANSITIONS)) {
        expect(canTransition(S("CANCELLED"), S(target))).toBe(false);
      }
    });

    it("rejects unknown source status", () => {
      expect(canTransition(S("UNKNOWN"), S("DELIVERED"))).toBe(false);
    });
  });

  describe("getOrderPhaseLabel", () => {
    it("returns correct labels for all statuses", () => {
      expect(getOrderPhaseLabel(S("QUOTATION"))).toBe("Penawaran");
      expect(getOrderPhaseLabel(S("QUOTATION_SENT"))).toBe(
        "Penawaran Dikirim",
      );
      expect(getOrderPhaseLabel(S("QUOTATION_REJECTED"))).toBe("Ditolak");
      expect(getOrderPhaseLabel(S("QUOTATION_EXPIRED"))).toBe("Kadarluarsa");
      expect(getOrderPhaseLabel(S("DRAFT"))).toBe("Draft");
      expect(getOrderPhaseLabel(S("CONFIRMED"))).toBe("Dikonfirmasi");
      expect(getOrderPhaseLabel(S("IN_PRODUCTION"))).toBe("Diproduksi");
      expect(getOrderPhaseLabel(S("READY_TO_SHIP"))).toBe("Siap Kirim");
      expect(getOrderPhaseLabel(S("SHIPPED"))).toBe("Dikirim");
      expect(getOrderPhaseLabel(S("DELIVERED"))).toBe("Selesai");
      expect(getOrderPhaseLabel(S("CANCELLED"))).toBe("Dibatalkan");
    });

    it("returns raw status for unknown", () => {
      expect(getOrderPhaseLabel(S("UNKNOWN"))).toBe("UNKNOWN");
    });
  });
});
