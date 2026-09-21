import { describe, expect, it } from "vitest";
import { DomainError } from "../../globals/errors";
import { grams, kg } from "../../globals/weight";
import {
  allocateFefo,
  allocatePacksFefo,
  availableG,
  availablePacks,
  isAllocatable,
  preferredLot,
} from "./allocate";
import type { AllocatableLot } from "./allocate";

function lot(overrides: Partial<AllocatableLot> & { id: string }): AllocatableLot {
  return {
    harvestYear: 1405,
    quantityOnHandG: kg(100),
    quantityReservedG: grams(0),
    status: "active",
    ...overrides,
  };
}

describe("availableG()", () => {
  it("subtracts reserved stock", () => {
    expect(availableG(lot({ id: "a", quantityOnHandG: kg(100), quantityReservedG: kg(30) }))).toBe(
      kg(70),
    );
  });

  it("never goes negative even if the cache is skewed", () => {
    expect(availableG(lot({ id: "a", quantityOnHandG: kg(1), quantityReservedG: kg(5) }))).toBe(0);
  });
});

describe("isAllocatable()", () => {
  it.each(["incoming", "quarantined", "archived", "depleted"])("excludes %s lots", (status) => {
    expect(isAllocatable(lot({ id: "a", status }))).toBe(false);
  });

  it("excludes a fully reserved lot", () => {
    expect(
      isAllocatable(lot({ id: "a", quantityOnHandG: kg(10), quantityReservedG: kg(10) })),
    ).toBe(false);
  });
});

describe("allocateFefo()", () => {
  it("ships the oldest harvest first", () => {
    const lots = [
      lot({ id: "new", harvestYear: 1405, quantityOnHandG: kg(50) }),
      lot({ id: "old", harvestYear: 1403, quantityOnHandG: kg(50) }),
      lot({ id: "mid", harvestYear: 1404, quantityOnHandG: kg(50) }),
    ];
    expect(allocateFefo(lots, kg(10))).toEqual([{ lotId: "old", quantityG: kg(10) }]);
  });

  it("spills across lots in age order when one cannot cover it", () => {
    const lots = [
      lot({ id: "old", harvestYear: 1403, quantityOnHandG: kg(8) }),
      lot({ id: "new", harvestYear: 1405, quantityOnHandG: kg(50) }),
    ];
    expect(allocateFefo(lots, kg(20))).toEqual([
      { lotId: "old", quantityG: kg(8) },
      { lotId: "new", quantityG: kg(12) },
    ]);
  });

  it("respects reservations held by other carts", () => {
    const lots = [
      lot({ id: "old", harvestYear: 1403, quantityOnHandG: kg(10), quantityReservedG: kg(9) }),
      lot({ id: "new", harvestYear: 1405, quantityOnHandG: kg(50) }),
    ];
    expect(allocateFefo(lots, kg(5))).toEqual([
      { lotId: "old", quantityG: kg(1) },
      { lotId: "new", quantityG: kg(4) },
    ]);
  });

  it("skips non-active lots entirely", () => {
    const lots = [
      lot({ id: "quarantined", harvestYear: 1402, status: "quarantined" }),
      lot({ id: "active", harvestYear: 1405 }),
    ];
    expect(allocateFefo(lots, kg(5))).toEqual([{ lotId: "active", quantityG: kg(5) }]);
  });

  it("throws OUT_OF_STOCK rather than allocating partially", () => {
    const lots = [lot({ id: "a", quantityOnHandG: kg(3) })];
    expect(() => allocateFefo(lots, kg(10))).toThrow(DomainError);
    try {
      allocateFefo(lots, kg(10));
    } catch (error) {
      expect((error as DomainError).code).toBe("OUT_OF_STOCK");
      expect((error as DomainError).detail).toMatchObject({ requiredG: 10_000, availableG: 3000 });
    }
  });

  it("rejects a non-positive requirement", () => {
    expect(() => allocateFefo([lot({ id: "a" })], grams(0))).toThrow(DomainError);
  });

  it("is deterministic when harvest years tie", () => {
    const lots = [
      lot({ id: "b", quantityOnHandG: kg(5) }),
      lot({ id: "a", quantityOnHandG: kg(5) }),
    ];
    expect(allocateFefo(lots, kg(7))[0]?.lotId).toBe("a");
  });

  it("allocates exactly the amount requested", () => {
    const lots = [
      lot({ id: "old", harvestYear: 1403, quantityOnHandG: kg(7) }),
      lot({ id: "new", harvestYear: 1405, quantityOnHandG: kg(7) }),
    ];
    const total = allocateFefo(lots, kg(11)).reduce((sum, a) => sum + a.quantityG, 0);
    expect(total).toBe(kg(11));
  });
});

describe("preferredLot()", () => {
  it("picks the oldest lot that can cut a whole pack", () => {
    const lots = [
      lot({ id: "old-but-short", harvestYear: 1403, quantityOnHandG: kg(4) }),
      lot({ id: "next-oldest", harvestYear: 1404, quantityOnHandG: kg(40) }),
    ];
    expect(preferredLot(lots, kg(10))?.id).toBe("next-oldest");
  });

  it("returns null when no lot can fill the pack", () => {
    expect(preferredLot([lot({ id: "a", quantityOnHandG: kg(2) })], kg(20))).toBeNull();
  });
});

describe("availablePacks()", () => {
  it("floors to whole packs, never promising a partial bag", () => {
    expect(availablePacks(lot({ id: "a", quantityOnHandG: kg(24) }), kg(10))).toBe(2);
  });

  it("is zero for a non-allocatable lot", () => {
    expect(availablePacks(lot({ id: "a", status: "quarantined" }), kg(10))).toBe(0);
  });
});

describe("allocatePacksFefo()", () => {
  it("fills the order from a single oldest lot when it has enough", () => {
    const lots = [
      lot({ id: "old", harvestYear: 1403, quantityOnHandG: kg(50) }),
      lot({ id: "new", harvestYear: 1405, quantityOnHandG: kg(50) }),
    ];
    expect(allocatePacksFefo(lots, kg(10), 3)).toEqual([{ lotId: "old", packs: 3 }]);
  });

  it("splits across lots, oldest first, when one cannot cover it alone", () => {
    const lots = [
      lot({ id: "old", harvestYear: 1403, quantityOnHandG: kg(25) }), // 2 whole 10kg packs
      lot({ id: "new", harvestYear: 1405, quantityOnHandG: kg(50) }),
    ];
    expect(allocatePacksFefo(lots, kg(10), 5)).toEqual([
      { lotId: "old", packs: 2 },
      { lotId: "new", packs: 3 },
    ]);
  });

  it("never promises a partial pack even if the grams exist", () => {
    // 24kg total is not enough for 3 whole 10kg packs, even though 3*8=24.
    const lots = [lot({ id: "a", quantityOnHandG: kg(24) })];
    expect(() => allocatePacksFefo(lots, kg(10), 3)).toThrow(DomainError);
  });

  it("throws OUT_OF_STOCK with the shortfall reported in packs", () => {
    const lots = [lot({ id: "a", quantityOnHandG: kg(15) })]; // 1 pack of 10kg
    try {
      allocatePacksFefo(lots, kg(10), 4);
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe("OUT_OF_STOCK");
      expect((error as DomainError).detail).toMatchObject({ packsNeeded: 4, availablePacks: 1 });
    }
  });

  it("rejects a non-positive or fractional pack count", () => {
    const lots = [lot({ id: "a" })];
    expect(() => allocatePacksFefo(lots, kg(10), 0)).toThrow(DomainError);
    expect(() => allocatePacksFefo(lots, kg(10), 1.5)).toThrow(DomainError);
  });

  it("respects reservations already held by other carts", () => {
    // 12kg on hand, 5kg reserved -> 7kg free -> zero whole 10kg packs.
    const lots = [lot({ id: "a", quantityOnHandG: kg(12), quantityReservedG: kg(5) })];
    expect(() => allocatePacksFefo(lots, kg(10), 1)).toThrow(DomainError);
  });
});
