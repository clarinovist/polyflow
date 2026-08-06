import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCustomers,
  getCustomerById,
  getNextCustomerCode,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  toggleCustomerActive,
} from "../customer";
import { prisma } from "@/lib/core/prisma";
import { logger } from "@/lib/config/logger";
import { requireAuth } from "@/lib/tools/auth-checks";
import {
  requireSalesAccess,
  requireSalesApprover,
} from "@/lib/auth/sales-access";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    customer: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/core/tenant", () => ({
  withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/tools/auth-checks", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: "u1", role: "WAREHOUSE", roles: ["WAREHOUSE"] } }),
}));

vi.mock("@/lib/auth/sales-access", () => ({
  requireSalesAccess: vi.fn().mockResolvedValue({ user: { id: "u1", role: "SALES", roles: ["SALES"] } }),
  requireSalesApprover: vi.fn().mockResolvedValue({ user: { id: "u1", role: "ADMIN", roles: ["ADMIN"] } }),
}));

vi.mock("@/lib/config/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

// ── Tests ──────────────────────────────────────────────────────────────

describe("customer actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to happy-path defaults
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "u1", role: "WAREHOUSE", roles: ["WAREHOUSE"] } } as any);
    vi.mocked(requireSalesAccess).mockResolvedValue({ user: { id: "u1", role: "SALES", roles: ["SALES"] } } as any);
    vi.mocked(requireSalesApprover).mockResolvedValue({ user: { id: "u1", role: "ADMIN", roles: ["ADMIN"] } } as any);
  });

  // ── getCustomers (exception lintas-portal) ───────────────────────

  describe("getCustomers", () => {
    it("returns all customers ordered by name ascending", async () => {
      // Arrange
      const mockCustomers = [
        { id: "1", name: "Alice Corp", code: "CUS-001" },
        { id: "2", name: "Bob Ltd", code: "CUS-002" },
      ];
      vi.mocked(prisma.customer.findMany).mockResolvedValue(
        mockCustomers as never,
      );

      // Act
      const result = await getCustomers();

      // Assert — safeAction wraps result in { success, data } envelope
      expect(result).toEqual({ success: true, data: mockCustomers });
      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        orderBy: { name: "asc" },
      });
    });

    it("returns empty array when no customers exist", async () => {
      // Arrange
      vi.mocked(prisma.customer.findMany).mockResolvedValue([]);

      // Act
      const result = await getCustomers();

      // Assert
      expect(result).toEqual({ success: true, data: [] });
    });

    it("allows WAREHOUSE role (lintas-portal exception — tetap requireAuth polos)", async () => {
      // getCustomers uses requireAuth, not requireSalesAccess — so WAREHOUSE passes
      vi.mocked(prisma.customer.findMany).mockResolvedValue([]);
      // requireAuth resolves regardless of role
      const result = await getCustomers();
      expect(result.success).toBe(true);
      expect(requireAuth).toHaveBeenCalled();
      expect(requireSalesAccess).not.toHaveBeenCalled();
      expect(requireSalesApprover).not.toHaveBeenCalled();
    });

    it("rejects when unauthenticated", async () => {
      // Simulate requireAuth throwing
      const { BusinessRuleError } = await import("@/lib/errors/errors");
      vi.mocked(requireAuth).mockRejectedValue(new BusinessRuleError("Unauthorized"));
      const result = await getCustomers();
      expect(result.success).toBe(false);
    });
  });

  // ── getCustomerById ───────────────────────────────────────────────

  describe("getCustomerById", () => {
    it("returns customer matching the given id", async () => {
      // Arrange
      const mockCustomer = { id: "cust-1", name: "Acme Inc", code: "CUS-001" };
      vi.mocked(prisma.customer.findUnique).mockResolvedValue(
        mockCustomer as never,
      );

      // Act
      const result = await getCustomerById("cust-1");

      // Assert — safeAction wraps result in { success, data } envelope
      expect(result).toEqual({ success: true, data: mockCustomer });
      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { id: "cust-1" },
      });
    });

    it("returns null data when customer is not found", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);

      // Act
      const result = await getCustomerById("nonexistent");

      // Assert
      expect(result).toEqual({ success: true, data: null });
    });

    it("requires SALES role — WAREHOUSE rejected", async () => {
      const { BusinessRuleError } = await import("@/lib/errors/errors");
      vi.mocked(requireSalesAccess).mockRejectedValue(new BusinessRuleError("Unauthorized: Akses sales hanya untuk admin atau sales."));
      const result = await getCustomerById("cust-1") as any;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unauthorized/);
    });
  });

  // ── getNextCustomerCode ───────────────────────────────────────────

  describe("getNextCustomerCode", () => {
    it("returns CUS-001 when no customers exist yet", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);

      // Act
      const result = await getNextCustomerCode();

      // Assert
      expect(result).toBe("CUS-001");
      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { code: { startsWith: "CUS-" } },
        orderBy: { code: "desc" },
        select: { code: true },
      });
    });

    it("increments the number from the last customer code", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue({
        code: "CUS-005",
      } as never);

      // Act
      const result = await getNextCustomerCode();

      // Assert
      expect(result).toBe("CUS-006");
    });

    it("pads single-digit numbers to three digits", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue({
        code: "CUS-009",
      } as never);

      // Act
      const result = await getNextCustomerCode();

      // Assert
      expect(result).toBe("CUS-010");
    });

    it("handles large sequence numbers correctly", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue({
        code: "CUS-999",
      } as never);

      // Act
      const result = await getNextCustomerCode();

      // Assert
      expect(result).toBe("CUS-1000");
    });

    it("falls back to CUS-001 when last code has non-numeric suffix", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue({
        code: "CUS-abc",
      } as never);

      // Act
      const result = await getNextCustomerCode();

      // Assert
      expect(result).toBe("CUS-001");
    });

    it("falls back to CUS-001 when last code has empty suffix", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue({
        code: "CUS-",
      } as never);

      // Act
      const result = await getNextCustomerCode();

      // Assert
      expect(result).toBe("CUS-001");
    });
  });

  // ── createCustomer ────────────────────────────────────────────────

  describe("createCustomer", () => {
    it("creates customer with auto-generated code when code is not provided", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.customer.create).mockResolvedValue({
        id: "new-1",
        name: "New Customer",
        code: "CUS-001",
      } as never);

      // Act
      const result = await createCustomer({
        name: "New Customer",
      });

      // Assert
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "New Customer",
          code: "CUS-001",
        }),
      });
    });

    it("creates customer with provided code", async () => {
      // Arrange
      vi.mocked(prisma.customer.create).mockResolvedValue({
        id: "new-1",
        name: "Custom Code Customer",
        code: "CUS-100",
      } as never);

      // Act
      const result = await createCustomer({
        name: "Custom Code Customer",
        code: "CUS-100",
      });

      // Assert
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.findFirst).not.toHaveBeenCalled();
      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Custom Code Customer",
          code: "CUS-100",
        }),
      });
    });

    it("trims whitespace from provided code", async () => {
      // Arrange
      vi.mocked(prisma.customer.create).mockResolvedValue({
        id: "new-1",
        name: "Trimmed Customer",
        code: "CUS-200",
      } as never);

      // Act
      const result = await createCustomer({
        name: "Trimmed Customer",
        code: "  CUS-200  ",
      });

      // Assert
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: "CUS-200",
        }),
      });
    });

    it("skips to auto-generation when provided code is empty string after trim", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.customer.create).mockResolvedValue({
        id: "new-1",
        name: "Empty Code Customer",
        code: "CUS-001",
      } as never);

      // Act
      const result = await createCustomer({
        name: "Empty Code Customer",
        code: "   ",
      });

      // Assert
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.findFirst).toHaveBeenCalled();
    });

    it("returns validation error when name is missing", async () => {
      // Act
      const result = await createCustomer({
        name: "",
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: "Name is required",
        code: "BUSINESS_RULE_VIOLATION",
      });
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it("returns validation error when email format is invalid", async () => {
      // Act
      const result = await createCustomer({
        name: "Test Customer",
        email: "not-an-email",
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: "Invalid email address",
        code: "BUSINESS_RULE_VIOLATION",
      });
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it("allows empty string for email (optional field)", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.customer.create).mockResolvedValue({
        id: "new-1",
        name: "No Email Customer",
        code: "CUS-001",
      } as never);

      // Act
      const result = await createCustomer({
        name: "No Email Customer",
        email: "",
      });

      // Assert
      expect(result).toEqual({ success: true, data: null });
    });

    it("increments code on collision and eventually creates customer", async () => {
      // Arrange — CUS-001 exists, CUS-002 does not
      vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.customer.findUnique)
        .mockResolvedValueOnce({ id: "existing-1" } as never) // CUS-001 exists
        .mockResolvedValueOnce(null); // CUS-002 does not
      vi.mocked(prisma.customer.create).mockResolvedValue({
        id: "new-1",
        name: "Collision Customer",
        code: "CUS-002",
      } as never);

      // Act
      const result = await createCustomer({
        name: "Collision Customer",
      });

      // Assert
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: "CUS-002",
        }),
      });
    });

    it("succeeds even after 5 collision retries (uses last generated code)", async () => {
      // Arrange — all 5 attempts collide
      vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "existing",
      } as never);
      vi.mocked(prisma.customer.create).mockResolvedValue({
        id: "new-1",
        name: "Persistent Collision",
        code: "CUS-006",
      } as never);

      // Act
      const result = await createCustomer({
        name: "Persistent Collision",
      });

      // Assert — still succeeds, uses the last code generated
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.findUnique).toHaveBeenCalledTimes(5);
      expect(prisma.customer.create).toHaveBeenCalled();
    });

    it("returns error when database create fails", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.customer.create).mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Act
      const result = await createCustomer({
        name: "Failing Customer",
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: "Failed to create customer",
        code: "BUSINESS_RULE_VIOLATION",
      });
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to create customer",
        expect.objectContaining({ module: "CustomerActions" }),
      );
    });

    it("returns specific error for unique constraint violation", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
      const uniqueError = new Error(
        "Unique constraint failed on the fields: (`code`)",
      );
      vi.mocked(prisma.customer.create).mockRejectedValue(uniqueError);

      // Act
      const result = await createCustomer({
        name: "Duplicate Customer",
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: "Customer code already exists",
        code: "BUSINESS_RULE_VIOLATION",
      });
    });

    it("passes all optional fields to prisma create", async () => {
      // Arrange
      vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.customer.create).mockResolvedValue({
        id: "new-1",
        name: "Full Customer",
        code: "CUS-001",
      } as never);

      // Act
      await createCustomer({
        name: "Full Customer",
        phone: "+628123456789",
        email: "full@example.com",
        billingAddress: "123 Main St",
        shippingAddress: "456 Ship Ave",
        taxId: "1234567890",
        creditLimit: 1000000,
        paymentTermDays: 30,
        discountPercent: 10,
        notes: "Important customer",
      });

      // Assert
      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: {
          name: "Full Customer",
          code: "CUS-001",
          phone: "+628123456789",
          email: "full@example.com",
          billingAddress: "123 Main St",
          shippingAddress: "456 Ship Ave",
          taxId: "1234567890",
          creditLimit: 1000000,
          paymentTermDays: 30,
          discountPercent: 10,
          notes: "Important customer",
        },
      });
    });

    it("rejects WAREHOUSE role for createCustomer", async () => {
      const { BusinessRuleError } = await import("@/lib/errors/errors");
      vi.mocked(requireSalesAccess).mockRejectedValue(new BusinessRuleError("Unauthorized: Akses sales hanya untuk admin atau sales."));
      const result = await createCustomer({ name: "Blocked Customer" }) as any;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unauthorized/);
    });
  });

  // ── updateCustomer ────────────────────────────────────────────────

  describe("updateCustomer", () => {
    it("returns validation error when discountPercent exceeds max", async () => {
      // Arrange — discountPercent max is 100, value 150 fails validation
      // Act
      const result = await updateCustomer({
        id: "cust-1",
        discountPercent: 150,
      });

      // Assert — triggers the BusinessRuleError on line 125
      expect(result).toEqual({
        success: false,
        error: expect.any(String),
        code: "BUSINESS_RULE_VIOLATION",
      });
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it("updates customer and returns success", async () => {
      // Arrange
      vi.mocked(prisma.customer.update).mockResolvedValue({
        id: "cust-1",
        name: "Updated Name",
      } as never);

      // Act
      const result = await updateCustomer({
        id: "cust-1",
        name: "Updated Name",
      });

      // Assert — updateCustomerSchema includes id in parsed result.data
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust-1" },
        data: { id: "cust-1", name: "Updated Name" },
      });
    });

    it("succeeds with empty id string (z.string() accepts empty)", async () => {
      // Arrange — z.string() does not reject empty strings
      vi.mocked(prisma.customer.update).mockResolvedValue({
        id: "",
        name: "Test",
      } as never);

      // Act
      const result = await updateCustomer({
        id: "",
        name: "Test",
      });

      // Assert
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "" },
        data: { id: "", name: "Test" },
      });
    });

    it("returns error when database update fails", async () => {
      // Arrange
      vi.mocked(prisma.customer.update).mockRejectedValue(
        new Error("Record not found"),
      );

      // Act
      const result = await updateCustomer({
        id: "nonexistent",
        name: "Ghost Customer",
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: "Failed to update customer",
        code: "BUSINESS_RULE_VIOLATION",
      });
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to update customer",
        expect.objectContaining({
          customerId: "nonexistent",
          module: "CustomerActions",
        }),
      );
    });

    it("updates only provided fields", async () => {
      // Arrange
      vi.mocked(prisma.customer.update).mockResolvedValue({
        id: "cust-1",
        name: "Partial Update",
      } as never);

      // Act
      const result = await updateCustomer({
        id: "cust-1",
        phone: "+628111111111",
      });

      // Assert — id is always included in parsed data from updateCustomerSchema
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust-1" },
        data: { id: "cust-1", phone: "+628111111111" },
      });
    });

    it("updates all optional fields", async () => {
      // Arrange
      vi.mocked(prisma.customer.update).mockResolvedValue({
        id: "cust-1",
        name: "Full Update",
      } as never);

      // Act
      await updateCustomer({
        id: "cust-1",
        name: "Full Update",
        phone: "+628123456789",
        email: "updated@example.com",
        billingAddress: "789 New St",
        shippingAddress: "321 Ship Blvd",
        taxId: "0987654321",
        creditLimit: 2000000,
        paymentTermDays: 60,
        discountPercent: 15,
        notes: "Updated notes",
      });

      // Assert
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust-1" },
        data: {
          id: "cust-1",
          name: "Full Update",
          phone: "+628123456789",
          email: "updated@example.com",
          billingAddress: "789 New St",
          shippingAddress: "321 Ship Blvd",
          taxId: "0987654321",
          creditLimit: 2000000,
          paymentTermDays: 60,
          discountPercent: 15,
          notes: "Updated notes",
        },
      });
    });
  });

  // ── toggleCustomerActive ──────────────────────────────────────────

  describe("toggleCustomerActive", () => {
    it("sets isActive to false and returns success", async () => {
      // Arrange
      vi.mocked(prisma.customer.update).mockResolvedValue({
        id: "cust-1",
        isActive: false,
      } as never);

      // Act
      const result = await toggleCustomerActive({
        id: "cust-1",
        isActive: false,
      });

      // Assert
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust-1" },
        data: { isActive: false },
      });
      expect(requireSalesAccess).toHaveBeenCalled();
    });

    it("sets isActive to true and returns success", async () => {
      // Arrange
      vi.mocked(prisma.customer.update).mockResolvedValue({
        id: "cust-1",
        isActive: true,
      } as never);

      // Act
      const result = await toggleCustomerActive({
        id: "cust-1",
        isActive: true,
      });

      // Assert
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust-1" },
        data: { isActive: true },
      });
    });

    it("rejects when requireSalesAccess guard fails (e.g. WAREHOUSE role)", async () => {
      const { BusinessRuleError } = await import("@/lib/errors/errors");
      vi.mocked(requireSalesAccess).mockRejectedValue(
        new BusinessRuleError(
          "Unauthorized: Akses sales hanya untuk admin atau sales.",
        ),
      );

      // Act
      const result = (await toggleCustomerActive({
        id: "cust-1",
        isActive: false,
      })) as any;

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unauthorized/);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it("returns error when database update fails", async () => {
      // Arrange
      vi.mocked(prisma.customer.update).mockRejectedValue(
        new Error("Record not found"),
      );

      // Act
      const result = await toggleCustomerActive({
        id: "nonexistent",
        isActive: true,
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: "Failed to update customer status",
        code: "BUSINESS_RULE_VIOLATION",
      });
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to toggle customer active status",
        expect.objectContaining({
          customerId: "nonexistent",
          module: "CustomerActions",
        }),
      );
    });
  });

  // ── deleteCustomer ────────────────────────────────────────────────

  describe("deleteCustomer", () => {
    it("deletes customer and returns success for ADMIN", async () => {
      // Arrange
      vi.mocked(prisma.customer.delete).mockResolvedValue({
        id: "cust-1",
        name: "Deleted Customer",
      } as never);

      // Act
      const result = await deleteCustomer("cust-1");

      // Assert
      expect(result).toEqual({ success: true, data: null });
      expect(prisma.customer.delete).toHaveBeenCalledWith({
        where: { id: "cust-1" },
      });
      expect(requireSalesApprover).toHaveBeenCalled();
    });

    it("rejects delete for SALES role", async () => {
      const { BusinessRuleError } = await import("@/lib/errors/errors");
      vi.mocked(requireSalesApprover).mockRejectedValue(new BusinessRuleError("Unauthorized: Hanya admin yang dapat melakukan aksi ini (cancel order, force ops)."));
      const result = await deleteCustomer("cust-1") as any;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unauthorized/);
      expect(prisma.customer.delete).not.toHaveBeenCalled();
    });

    it("returns error when database delete fails", async () => {
      // Arrange
      vi.mocked(prisma.customer.delete).mockRejectedValue(
        new Error("Record not found"),
      );

      // Act
      const result = await deleteCustomer("nonexistent");

      // Assert
      expect(result).toEqual({
        success: false,
        error: "Failed to delete customer",
        code: "BUSINESS_RULE_VIOLATION",
      });
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to delete customer",
        expect.objectContaining({
          customerId: "nonexistent",
          module: "CustomerActions",
        }),
      );
    });

    it("returns error when foreign key constraint prevents deletion", async () => {
      // Arrange
      const fkError = new Error(
        "Foreign key constraint failed on the fields: (`customerId`)",
      );
      vi.mocked(prisma.customer.delete).mockRejectedValue(fkError);

      // Act
      const result = await deleteCustomer("cust-linked");

      // Assert
      expect(result).toEqual({
        success: false,
        error: "Failed to delete customer",
        code: "BUSINESS_RULE_VIOLATION",
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
