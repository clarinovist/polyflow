import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/services/accounting/account-resolver", () => ({
  resolveAccount: vi.fn(),
  AccountRole: {},
}));

import { prisma } from "@/lib/core/prisma";
import { resolveAccount } from "@/services/accounting/account-resolver";
import {
  getAccountByCode,
  getAccountByRole,
  getPaymentAccountRole,
} from "@/services/finance/auto-journal-shared";

describe("auto-journal-shared", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAccountByCode", () => {
    it("returns account when found", async () => {
      const mockAccount = { id: "acc-1", code: "11100", name: "Cash" };
      vi.mocked(prisma.account.findUnique).mockResolvedValue(
        mockAccount as never,
      );

      const result = await getAccountByCode("11100");

      expect(result).toEqual(mockAccount);
    });

    it("throws when account not found", async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(null);

      await expect(getAccountByCode("99999")).rejects.toThrow(
        "Account code 99999 not found",
      );
    });
  });

  describe("getAccountByRole", () => {
    it("delegates to resolveAccount", async () => {
      const mockAccount = { id: "acc-2", code: "11200" };
      vi.mocked(resolveAccount).mockResolvedValue(mockAccount as never);

      const result = await getAccountByRole("accounts-receivable");

      expect(resolveAccount).toHaveBeenCalledWith("accounts-receivable");
      expect(result).toEqual(mockAccount);
    });
  });

  describe("getPaymentAccountRole", () => {
    it("returns petty-cash for cash", () => {
      expect(getPaymentAccountRole("cash")).toBe("petty-cash");
    });

    it("returns bank-bca for bank transfer", () => {
      expect(getPaymentAccountRole("Bank Transfer")).toBe("bank-bca");
    });

    it("returns bank-bca for check", () => {
      expect(getPaymentAccountRole("check")).toBe("bank-bca");
    });

    it("returns bank-bca for credit card", () => {
      expect(getPaymentAccountRole("credit card")).toBe("bank-bca");
    });

    it("returns bank-bca for unknown method", () => {
      expect(getPaymentAccountRole("unknown")).toBe("bank-bca");
    });
  });
});
