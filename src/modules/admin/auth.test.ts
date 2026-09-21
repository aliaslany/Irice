import { describe, expect, it } from "vitest";
import { isValidAdminToken } from "./auth";

describe("isValidAdminToken()", () => {
  it("accepts an exact match", () => {
    expect(isValidAdminToken("correct-token", "correct-token")).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(isValidAdminToken("wrong-token", "correct-token")).toBe(false);
  });

  it("rejects a token of a different length without throwing", () => {
    expect(isValidAdminToken("short", "a-much-longer-correct-token")).toBe(false);
  });

  it("rejects an empty candidate", () => {
    expect(isValidAdminToken("", "correct-token")).toBe(false);
  });
});
