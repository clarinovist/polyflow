import { describe, expect, it } from "vitest";
import { getUserRoles, hasAnyRole, hasRole, isTenantAdmin } from "../roles";

describe("Roles Helper", () => {
  describe("getUserRoles", () => {
    it("should return empty array if user is null or undefined", () => {
      expect(getUserRoles(null)).toEqual([]);
      expect(getUserRoles(undefined)).toEqual([]);
    });

    it("should fallback to primary role if roles array is empty or undefined", () => {
      expect(getUserRoles({ role: "WAREHOUSE" })).toEqual(["WAREHOUSE"]);
      expect(getUserRoles({ role: "ADMIN", roles: null })).toEqual(["ADMIN"]);
      expect(getUserRoles({ role: "ADMIN", roles: [] })).toEqual(["ADMIN"]);
    });

    it("should return unique roles array when present", () => {
      expect(getUserRoles({ role: "WAREHOUSE", roles: ["WAREHOUSE", "PRODUCTION", "WAREHOUSE"] })).toEqual(["WAREHOUSE", "PRODUCTION"]);
    });
  });

  describe("hasAnyRole", () => {
    it("should return true if user has ADMIN role even if not requested", () => {
      expect(hasAnyRole({ role: "ADMIN" }, "WAREHOUSE")).toBe(true);
      expect(hasAnyRole({ roles: ["ADMIN"] }, "PRODUCTION")).toBe(true);
    });

    it("should return true if user has any of the requested roles", () => {
      expect(hasAnyRole({ roles: ["WAREHOUSE", "PRODUCTION"] }, "PRODUCTION")).toBe(true);
      expect(hasAnyRole({ roles: ["WAREHOUSE", "PRODUCTION"] }, ["PLANNING", "PRODUCTION"])).toBe(true);
    });

    it("should return false if user does not have any of the requested roles", () => {
      expect(hasAnyRole({ roles: ["WAREHOUSE"] }, ["PRODUCTION", "FINANCE"])).toBe(false);
    });
  });

  describe("hasRole", () => {
    it("should return true if user has the specific role", () => {
      expect(hasRole({ roles: ["SALES", "FINANCE"] }, "FINANCE")).toBe(true);
    });

    it("should return false if user does not have the specific role", () => {
      expect(hasRole({ roles: ["SALES"] }, "FINANCE")).toBe(false);
    });
  });

  describe("isTenantAdmin", () => {
    it("should return true if user has ADMIN role", () => {
      expect(isTenantAdmin({ role: "ADMIN" })).toBe(true);
      expect(isTenantAdmin({ roles: ["ADMIN", "SALES"] })).toBe(true);
    });

    it("should return false if user is not ADMIN", () => {
      expect(isTenantAdmin({ role: "SALES" })).toBe(false);
      expect(isTenantAdmin({ roles: ["SALES", "FINANCE"] })).toBe(false);
    });
  });
});
