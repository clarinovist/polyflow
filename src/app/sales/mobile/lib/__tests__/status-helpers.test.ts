import { describe, it, expect } from "vitest";
import {
  getMobileStatusColor,
  getMobileStatusLabel,
  filterOrders,
  getMobileOrderActions,
  STATUS_OPTIONS,
  type MobileOrder,
} from "../status-helpers";

// --- Test data ---
const mockOrders: MobileOrder[] = [
  {
    id: "1",
    orderNumber: "SO-001",
    orderDate: "2026-06-27",
    status: "DRAFT",
    totalAmount: 1000000,
    customerName: "PT Maju Jaya",
    itemCount: 3,
  },
  {
    id: "2",
    orderNumber: "SO-002",
    orderDate: "2026-06-26",
    status: "CONFIRMED",
    totalAmount: 2500000,
    customerName: "CV Sejahtera",
    itemCount: 5,
  },
  {
    id: "3",
    orderNumber: "SO-003",
    orderDate: "2026-06-25",
    status: "DELIVERED",
    totalAmount: null,
    customerName: "PT Maju Jaya",
    itemCount: 1,
  },
  {
    id: "4",
    orderNumber: "SO-004",
    orderDate: "2026-06-24",
    status: "CANCELLED",
    totalAmount: 500000,
    customerName: "Toko ABC",
    itemCount: 2,
  },
  {
    id: "5",
    orderNumber: "SO-005",
    orderDate: "2026-06-23",
    status: "SHIPPED",
    totalAmount: 3000000,
    customerName: "CV Sejahtera",
    itemCount: 4,
  },
];

// --- getMobileStatusColor ---
describe("getMobileStatusColor", () => {
  it("returns slate for DRAFT", () => {
    expect(getMobileStatusColor("DRAFT")).toContain("slate");
  });

  it("returns blue for CONFIRMED", () => {
    expect(getMobileStatusColor("CONFIRMED")).toContain("blue");
  });

  it("returns amber for IN_PRODUCTION", () => {
    expect(getMobileStatusColor("IN_PRODUCTION")).toContain("amber");
  });

  it("returns indigo for READY_TO_SHIP", () => {
    expect(getMobileStatusColor("READY_TO_SHIP")).toContain("indigo");
  });

  it("returns purple for SHIPPED", () => {
    expect(getMobileStatusColor("SHIPPED")).toContain("purple");
  });

  it("returns emerald for DELIVERED", () => {
    expect(getMobileStatusColor("DELIVERED")).toContain("emerald");
  });

  it("returns red for CANCELLED", () => {
    expect(getMobileStatusColor("CANCELLED")).toContain("red");
  });

  it("returns slate default for unknown status", () => {
    expect(getMobileStatusColor("UNKNOWN")).toContain("slate");
  });
});

// --- getMobileStatusLabel ---
describe("getMobileStatusLabel", () => {
  it.each(STATUS_OPTIONS.filter((o) => o.value !== "ALL"))(
    'returns "$label" for $value',
    ({ value, label }) => {
      expect(getMobileStatusLabel(value)).toBe(label);
    },
  );

  it("returns raw status for unknown value", () => {
    expect(getMobileStatusLabel("WEIRD_STATUS")).toBe("WEIRD_STATUS");
  });
});

// --- filterOrders ---
describe("filterOrders", () => {
  it("returns all orders when no filters applied", () => {
    const result = filterOrders(mockOrders, "", "ALL");
    expect(result).toHaveLength(5);
  });

  it("filters by status", () => {
    const result = filterOrders(mockOrders, "", "DRAFT");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters by status DELIVERED", () => {
    const result = filterOrders(mockOrders, "", "DELIVERED");
    expect(result).toHaveLength(1);
    expect(result[0].orderNumber).toBe("SO-003");
  });

  it("filters by search query (order number)", () => {
    const result = filterOrders(mockOrders, "SO-002", "ALL");
    expect(result).toHaveLength(1);
    expect(result[0].customerName).toBe("CV Sejahtera");
  });

  it("filters by search query (customer name, case-insensitive)", () => {
    const result = filterOrders(mockOrders, "maju", "ALL");
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.id)).toEqual(["1", "3"]);
  });

  it("combines status filter and search query", () => {
    const result = filterOrders(mockOrders, "sejahtera", "CONFIRMED");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("returns empty when no match", () => {
    const result = filterOrders(mockOrders, "nonexistent", "ALL");
    expect(result).toHaveLength(0);
  });

  it("returns empty when status has no orders", () => {
    const result = filterOrders(mockOrders, "", "IN_PRODUCTION");
    expect(result).toHaveLength(0);
  });
});

// --- getMobileOrderActions ---
describe("getMobileOrderActions", () => {
  it("returns confirm + cancel for DRAFT", () => {
    expect(getMobileOrderActions("DRAFT")).toEqual(["confirm", "cancel"]);
  });

  it("returns ship + cancel for CONFIRMED", () => {
    expect(getMobileOrderActions("CONFIRMED")).toEqual(["ship", "cancel"]);
  });

  it("returns ship + cancel for READY_TO_SHIP", () => {
    expect(getMobileOrderActions("READY_TO_SHIP")).toEqual(["ship", "cancel"]);
  });

  it("returns ready_to_ship for IN_PRODUCTION", () => {
    expect(getMobileOrderActions("IN_PRODUCTION")).toEqual(["ready_to_ship"]);
  });

  it("returns deliver for SHIPPED", () => {
    expect(getMobileOrderActions("SHIPPED")).toEqual(["deliver"]);
  });

  it("returns empty for DELIVERED (terminal)", () => {
    expect(getMobileOrderActions("DELIVERED")).toEqual([]);
  });

  it("returns empty for CANCELLED (terminal)", () => {
    expect(getMobileOrderActions("CANCELLED")).toEqual([]);
  });

  it("returns empty for unknown status", () => {
    expect(getMobileOrderActions("UNKNOWN")).toEqual([]);
  });
});
