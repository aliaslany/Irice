# Irice

Mill-direct Iranian rice, sold by the kilogram with every bag traceable to its lot.

Phase 0 of [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the domain foundation —
the Variety → Lot → SKU schema, the globals layer, and the two pure modules
(pricing and FEFO allocation) that the schema exists to serve. No storefront yet.

- [docs/MARKET-REVIEW.md](docs/MARKET-REVIEW.md) — Iranian and international sellers, and where the gap is
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the design this implements

## Getting started

```bash
pnpm install
cp .env.example .env      # then set DATABASE_URL
pnpm db:migrate
pnpm test
```

## The four rules

Everything in `src/globals/` exists to enforce these. They are cheap on day one
and expensive on day two hundred:

1. **Money is an integer number of rials.** Never a float, never Toman in
   storage. Toman is a display unit (`formatMoney`). Where a price is a fraction
   of another — `price_per_kg × grams / 1000` — use `mulRatioRial`, which stays
   in integer space, not a float factor.
2. **Weight is an integer number of grams.** Stock lives on the lot in grams, so
   one 20kg sale and four 5kg sales are the same movement.
3. **Timestamps are UTC `timestamptz` in the database; Jalali only at render.**
   The one genuinely Jalali value is `lots.harvest_year`, because that is how a
   crop is identified by every grower and buyer in the market.
4. **Persian input is normalised before validation.** `۰۹۱۲…` and `+98 912…`
   are the same phone number; Arabic ي/ك become Persian ی/ک.

## Why the schema looks like this

Rice is a commodity with a vintage. "Tarom Hashemi 10kg" is not one product —
it is a different good, at a different cost, with different stock, depending on
harvest year and mill run. So a standard `Product → Variant` shape is wrong:

```
Variety   content and SEO; owns no stock and no price
  └─ Lot  one milling batch: origin, harvest year, grade, lab certificate,
          rial-per-kg, grams on hand — the unit of recall and of costing
       └─ Sku   a pack size cut from a lot: 1 / 5 / 10 / 20 kg
```

Consequences worth knowing before you extend it:

- Subscriptions and reorders bind to **Variety + pack size**, never to a SKU,
  because the lot underneath changes between deliveries. `allocateFefo` picks
  the lot at ship time, oldest harvest first.
- `lots.quantity_on_hand_g` is a **cache** of `sum(delta_g)` in `stock_movements`.
  That table is the truth, is append-only, and every row carries an
  `idempotency_key` so a retried callback cannot move stock twice.
- SKU prices are **derived**, never typed by hand. An operator changes
  `lots.price_per_kg_rial` and `modules/pricing` recalculates every pack size.

## Scripts

| Command | What it does |
|---|---|
| `pnpm test` | Unit tests (vitest) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | Generate SQL migrations from the schema |
| `pnpm db:migrate` | Apply migrations |
| `psql "$DATABASE_URL" -f scripts/verify-constraints.sql` | Prove the database rejects impossible state |

`scripts/verify-constraints.sql` is worth knowing about: it asserts that the
database itself refuses a Gregorian harvest year, a reservation larger than
stock, a zero price, an unexplained stock movement, and a replayed sale. CI runs
it on every push.
