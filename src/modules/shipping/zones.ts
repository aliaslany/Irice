/**
 * Shipping zones.
 *
 * Data, not a table — a handful of rows an operator can read and reason
 * about, and changing a per-kg rate is a code review, not a migration. If
 * this grows past "readable in one file" it moves to the database; it is
 * kept here on purpose while the catalog itself is this small.
 *
 * Rates are Iran Post / Tipax-shaped: a base handling fee plus a per-kg rate,
 * because a 20kg bag is the dominant cost driver, not the box.
 */
import { rial, type Rial } from "../../globals/money";

export type ShippingZoneCode = "tehran" | "north" | "rest_of_country";

export interface ShippingZone {
  code: ShippingZoneCode;
  labelFa: string;
  baseFeeRial: Rial;
  perKgRial: Rial;
}

export const SHIPPING_ZONES: Record<ShippingZoneCode, ShippingZone> = {
  // Same-region delivery from the mill; cheapest by a wide margin.
  north: {
    code: "north",
    labelFa: "شمال کشور",
    baseFeeRial: rial(150_000),
    perKgRial: rial(8_000),
  },
  tehran: {
    code: "tehran",
    labelFa: "تهران",
    baseFeeRial: rial(250_000),
    perKgRial: rial(12_000),
  },
  rest_of_country: {
    code: "rest_of_country",
    labelFa: "سایر استان‌ها",
    baseFeeRial: rial(350_000),
    perKgRial: rial(16_000),
  },
};

const PROVINCE_ZONE: Record<string, ShippingZoneCode> = {
  گیلان: "north",
  مازندران: "north",
  گلستان: "north",
  تهران: "tehran",
};

/** Map a customer's province to the zone it ships in, defaulting conservatively. */
export function zoneForProvince(province: string): ShippingZone {
  const code = PROVINCE_ZONE[province.trim()] ?? "rest_of_country";
  return SHIPPING_ZONES[code];
}
