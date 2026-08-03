import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requirePurchasingAccess,
  requirePurchasingApprover,
  requirePurchasingFinance,
  requirePurchasingAnalyticsRead,
  requirePurchasingCreator,
} from "../purchasing-access";
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

describe("purchasing-access helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requirePurchasingAccess", () => {
    it("allows ADMIN", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("ADMIN"));
      const session = await requirePurchasingAccess();
      expect(session.user.role).toBe("ADMIN");
    });

    it("allows PROCUREMENT", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PROCUREMENT"));
      const session = await requirePurchasingAccess();
      expect(session.user.role).toBe("PROCUREMENT");
    });

    it("allows PLANNING", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PLANNING"));
      const session = await requirePurchasingAccess();
      expect(session.user.role).toBe("PLANNING");
    });

    it("rejects FINANCE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("FINANCE"));
      await expect(requirePurchasingAccess()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects WAREHOUSE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("WAREHOUSE"));
      await expect(requirePurchasingAccess()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects HRD", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("HRD"));
      await expect(requirePurchasingAccess()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects SALES", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("SALES"));
      await expect(requirePurchasingAccess()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects PRODUCTION", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PRODUCTION"));
      await expect(requirePurchasingAccess()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("throws when no session", async () => {
      vi.mocked(requireAuth).mockRejectedValue(new Error("No session"));
      await expect(requirePurchasingAccess()).rejects.toThrow("No session");
    });
  });

  describe("requirePurchasingApprover", () => {
    it("allows ADMIN", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("ADMIN"));
      const session = await requirePurchasingApprover();
      expect(session.user.role).toBe("ADMIN");
    });

    it("allows PROCUREMENT", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PROCUREMENT"));
      const session = await requirePurchasingApprover();
      expect(session.user.role).toBe("PROCUREMENT");
    });

    it("rejects PLANNING", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PLANNING"));
      await expect(requirePurchasingApprover()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects FINANCE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("FINANCE"));
      await expect(requirePurchasingApprover()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects WAREHOUSE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("WAREHOUSE"));
      await expect(requirePurchasingApprover()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects HRD", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("HRD"));
      await expect(requirePurchasingApprover()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects SALES", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("SALES"));
      await expect(requirePurchasingApprover()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("throws when no session", async () => {
      vi.mocked(requireAuth).mockRejectedValue(new Error("No session"));
      await expect(requirePurchasingApprover()).rejects.toThrow("No session");
    });
  });

  describe("requirePurchasingFinance", () => {
    it("allows ADMIN", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("ADMIN"));
      const session = await requirePurchasingFinance();
      expect(session.user.role).toBe("ADMIN");
    });

    it("allows FINANCE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("FINANCE"));
      const session = await requirePurchasingFinance();
      expect(session.user.role).toBe("FINANCE");
    });

    it("rejects PROCUREMENT", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PROCUREMENT"));
      await expect(requirePurchasingFinance()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects PLANNING", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PLANNING"));
      await expect(requirePurchasingFinance()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects WAREHOUSE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("WAREHOUSE"));
      await expect(requirePurchasingFinance()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects SALES", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("SALES"));
      await expect(requirePurchasingFinance()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects HRD", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("HRD"));
      await expect(requirePurchasingFinance()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("throws when no session", async () => {
      vi.mocked(requireAuth).mockRejectedValue(new Error("No session"));
      await expect(requirePurchasingFinance()).rejects.toThrow("No session");
    });
  });

  describe("requirePurchasingAnalyticsRead", () => {
    it("allows ADMIN", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("ADMIN"));
      const session = await requirePurchasingAnalyticsRead();
      expect(session.user.role).toBe("ADMIN");
    });

    it("allows PROCUREMENT", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PROCUREMENT"));
      const session = await requirePurchasingAnalyticsRead();
      expect(session.user.role).toBe("PROCUREMENT");
    });

    it("allows PLANNING", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PLANNING"));
      const session = await requirePurchasingAnalyticsRead();
      expect(session.user.role).toBe("PLANNING");
    });

    it("allows FINANCE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("FINANCE"));
      const session = await requirePurchasingAnalyticsRead();
      expect(session.user.role).toBe("FINANCE");
    });

    it("rejects WAREHOUSE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("WAREHOUSE"));
      await expect(requirePurchasingAnalyticsRead()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects HRD", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("HRD"));
      await expect(requirePurchasingAnalyticsRead()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects SALES", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("SALES"));
      await expect(requirePurchasingAnalyticsRead()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects PRODUCTION", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PRODUCTION"));
      await expect(requirePurchasingAnalyticsRead()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("throws when no session", async () => {
      vi.mocked(requireAuth).mockRejectedValue(new Error("No session"));
      await expect(requirePurchasingAnalyticsRead()).rejects.toThrow(
        "No session",
      );
    });
  });

  describe("requirePurchasingCreator", () => {
    it("allows ADMIN", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("ADMIN"));
      const session = await requirePurchasingCreator();
      expect(session.user.role).toBe("ADMIN");
    });

    it("allows PROCUREMENT", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PROCUREMENT"));
      const session = await requirePurchasingCreator();
      expect(session.user.role).toBe("PROCUREMENT");
    });

    it("allows PLANNING", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PLANNING"));
      const session = await requirePurchasingCreator();
      expect(session.user.role).toBe("PLANNING");
    });

    it("allows WAREHOUSE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("WAREHOUSE"));
      const session = await requirePurchasingCreator();
      expect(session.user.role).toBe("WAREHOUSE");
    });

    it("allows PRODUCTION", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("PRODUCTION"));
      const session = await requirePurchasingCreator();
      expect(session.user.role).toBe("PRODUCTION");
    });

    it("rejects FINANCE", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("FINANCE"));
      await expect(requirePurchasingCreator()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects HRD", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("HRD"));
      await expect(requirePurchasingCreator()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("rejects SALES", async () => {
      vi.mocked(requireAuth).mockResolvedValue(mockSession("SALES"));
      await expect(requirePurchasingCreator()).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it("throws when no session", async () => {
      vi.mocked(requireAuth).mockRejectedValue(new Error("No session"));
      await expect(requirePurchasingCreator()).rejects.toThrow("No session");
    });
  });
});
