import { describe, it, expect } from "vitest";
import { Ok, Err, ApplicationError } from "@/lib/utils/result";

describe("Ok", () => {
  it("creates ok result with value", () => {
    const result = Ok(42);
    expect(result.ok).toBe(true);
    expect((result as { ok: true; value: number }).value).toBe(42);
  });

  it("works with string values", () => {
    const result = Ok("hello");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("hello");
  });

  it("works with object values", () => {
    const result = Ok({ a: 1, b: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1, b: 2 });
  });
});

describe("Err", () => {
  it("creates error result", () => {
    const result = Err(new Error("fail"));
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: Error }).error.message).toBe("fail");
  });

  it("works with string errors", () => {
    const result = Err("something went wrong");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("something went wrong");
  });
});

describe("ApplicationError", () => {
  it("creates error with default statusCode 500", () => {
    const err = new ApplicationError("test error", "TEST_CODE");
    expect(err.message).toBe("test error");
    expect(err.code).toBe("TEST_CODE");
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("ApplicationError");
  });

  it("creates error with custom statusCode", () => {
    const err = new ApplicationError("not found", "NOT_FOUND", 404);
    expect(err.statusCode).toBe(404);
  });

  it("creates error with details", () => {
    const err = new ApplicationError("validation", "VALIDATION", 400, {
      field: "email",
    });
    expect(err.details).toEqual({ field: "email" });
  });

  it("is instanceof Error", () => {
    const err = new ApplicationError("test", "CODE");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApplicationError);
  });
});
