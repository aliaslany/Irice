import { describe, expect, it } from "vitest";
import { generateOrderNumber } from "./order-number";

describe("generateOrderNumber()", () => {
  it("always has the IR- prefix and 6 code characters", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateOrderNumber()).toMatch(/^IR-[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it("never contains ambiguous characters (0, O, 1, I) in the generated part", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOrderNumber();
      const generatedPart = code.replace(/^IR-/, "");
      expect(generatedPart).not.toMatch(/[01OI]/);
    }
  });
});
