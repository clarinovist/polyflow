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

vi.mock("@/services/settings/app-settings-service", () => ({
  getPaymentBanksSetting: vi.fn(),
}));

import { prisma } from "@/lib/core/prisma";
import { resolveAccount } from "@/services/accounting/account-resolver";
import { getPaymentBanksSetting } from "@/services/settings/app-settings-service";
import {
  getAccountByCode,
  getAccountByRole,
  getPaymentAccountRole,
  resolvePaymentBankAccount,
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

    it("throws when account tidak ditemukan", async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(null);

      await expect(getAccountByCode("99999")).rejects.toThrow(/tidak ditemukan/i);
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

    it("returns bank-bca for legacy bank transfer", () => {
      expect(getPaymentAccountRole("Bank Transfer")).toBe("bank-bca");
    });

    it("returns bank-bca for Transfer BCA", () => {
      expect(getPaymentAccountRole("Transfer BCA")).toBe("bank-bca");
    });

    it("returns bank-mandiri for Transfer Mandiri", () => {
      expect(getPaymentAccountRole("Transfer Mandiri")).toBe("bank-mandiri");
    });

    it("returns bank-bca for check without destination bank", () => {
      expect(getPaymentAccountRole("check")).toBe("bank-bca");
    });

    it("returns bank-mandiri for check clearing to Mandiri", () => {
      expect(getPaymentAccountRole("Check", "MANDIRI")).toBe("bank-mandiri");
    });

    it("returns bank-bca for check clearing to BCA", () => {
      expect(getPaymentAccountRole("Check", "BCA")).toBe("bank-bca");
    });

    it("returns bank-bca for credit card", () => {
      expect(getPaymentAccountRole("credit card")).toBe("bank-bca");
    });

    it("returns bank-bca for unknown method", () => {
      expect(getPaymentAccountRole("unknown")).toBe("bank-bca");
    });
  });

  describe("resolvePaymentBankAccount", () => {
    it("resolves BCA via the legacy AccountRole path, ignoring tenant banks", async () => {
      const mockAccount = { id: "acc-bca", code: "11120" };
      vi.mocked(resolveAccount).mockResolvedValue(mockAccount as never);

      const result = await resolvePaymentBankAccount("Transfer BCA", "BCA");

      expect(getPaymentBanksSetting).not.toHaveBeenCalled();
      expect(resolveAccount).toHaveBeenCalledWith("bank-bca");
      expect(result).toEqual(mockAccount);
    });

    it("resolves a tenant-configured third bank directly via glAccountId", async () => {
      vi.mocked(getPaymentBanksSetting).mockResolvedValue([
        {
          key: "BRI",
          name: "BRI",
          holder: "PT ACME",
          account: "333",
          glAccountId: "acc-bri-1",
        },
      ] as never);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "acc-bri-1",
        code: "11140",
        name: "Bank BRI",
        isActive: true,
      } as never);

      const result = await resolvePaymentBankAccount("Transfer BRI", "BRI");

      expect(prisma.account.findUnique).toHaveBeenCalledWith({
        where: { id: "acc-bri-1" },
      });
      expect(resolveAccount).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: "acc-bri-1",
        code: "11140",
        name: "Bank BRI",
        isActive: true,
      });
    });

    it("falls back to the AccountRole path when the third bank has no glAccountId mapped", async () => {
      vi.mocked(getPaymentBanksSetting).mockResolvedValue([
        { key: "BRI", name: "BRI", holder: "PT ACME", account: "333" },
      ] as never);
      const mockAccount = { id: "acc-bca", code: "11120" };
      vi.mocked(resolveAccount).mockResolvedValue(mockAccount as never);

      const result = await resolvePaymentBankAccount("Transfer BRI", "BRI");

      expect(resolveAccount).toHaveBeenCalledWith("bank-bca");
      expect(result).toEqual(mockAccount);
    });

    it("falls back to the AccountRole path when the mapped GL account is inactive", async () => {
      vi.mocked(getPaymentBanksSetting).mockResolvedValue([
        {
          key: "BRI",
          name: "BRI",
          holder: "PT ACME",
          account: "333",
          glAccountId: "acc-bri-1",
        },
      ] as never);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "acc-bri-1",
        code: "11140",
        name: "Bank BRI",
        isActive: false,
      } as never);
      const mockAccount = { id: "acc-bca", code: "11120" };
      vi.mocked(resolveAccount).mockResolvedValue(mockAccount as never);

      const result = await resolvePaymentBankAccount("Transfer BRI", "BRI");

      expect(resolveAccount).toHaveBeenCalledWith("bank-bca");
      expect(result).toEqual(mockAccount);
    });
  });
});
