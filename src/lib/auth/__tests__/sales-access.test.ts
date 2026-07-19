import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireSalesAccess, requireSalesApprover, requireSalesFinance } from "../sales-access";
import { BusinessRuleError } from "@/lib/errors/errors";

vi.mock("@/lib/tools/auth-checks", () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from "@/lib/tools/auth-checks";

function mockSession(role: string) {
  return {
    user: { id: "u1", name: "Test", role, roles: [role] },
  } as any;
}

describe("sales-access helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireSalesAccess", () => {
    it("allows ADMIN", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("ADMIN"));
      const session = await requireSalesAccess();
      expect(session.user.role).toBe("ADMIN");
    });

    it("allows SALES", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("SALES"));
      const session = await requireSalesAccess();
      expect(session.user.role).toBe("SALES");
    });

    it("rejects WAREHOUSE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("WAREHOUSE"));
      await expect(requireSalesAccess()).rejects.toThrow(BusinessRuleError);
    });

    it("rejects FINANCE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("FINANCE"));
      await expect(requireSalesAccess()).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("requireSalesApprover", () => {
    it("allows ADMIN", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("ADMIN"));
      const session = await requireSalesApprover();
      expect(session.user.role).toBe("ADMIN");
    });

    it("rejects SALES", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("SALES"));
      await expect(requireSalesApprover()).rejects.toThrow(BusinessRuleError);
    });

    it("rejects FINANCE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("FINANCE"));
      await expect(requireSalesApprover()).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("requireSalesFinance", () => {
    it("allows ADMIN", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("ADMIN"));
      const session = await requireSalesFinance();
      expect(session.user.role).toBe("ADMIN");
    });

    it("allows FINANCE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("FINANCE"));
      const session = await requireSalesFinance();
      expect(session.user.role).toBe("FINANCE");
    });

    it("rejects SALES", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("SALES"));
      await expect(requireSalesFinance()).rejects.toThrow(BusinessRuleError);
    });
  });
});
