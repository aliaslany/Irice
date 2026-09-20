# Irice

Mill-direct Iranian rice, sold by the kilogram with every bag traceable to its lot.

Phases 0–1 of [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the domain
foundation (the Variety → Lot → SKU schema, the globals layer, and the pricing
and FEFO modules it serves) plus the public catalog — variety pages, the lot
traceability page behind the QR code on the bag, and the SEO surface. No cart or
checkout yet; that is phase 2.

- [docs/MARKET-REVIEW.md](docs/MARKET-REVIEW.md) — Iranian and international sellers, and where the gap is
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the design this implements

## Getting started

```bash
pnpm install
cp .env.example .env      # then set DATABASE_URL
pnpm db:migrate
pnpm db:seed              # realistic varieties and lots to develop against
pnpm dev                  # http://localhost:3000
```

The seed deliberately includes two lots of طارم هاشمی from different harvest
years. That is the case FEFO ordering and the freshness badge exist for, and a
single-lot fixture would never exercise it.

## Pages

| Route | What it is |
|---|---|
| `/` | Variety index: price-from and freshness per variety |
| `/rice/[slug]` | Variety page — sellable lots in FEFO order, each pack size priced, with effective rial/kg |
| `/lot/[code]` | **Lot passport**: the QR target. Origin, mill, harvest year, grade, lab certificates, full price history |
| `/sitemap.xml`, `/robots.txt` | Includes every lot passport — the traceability claim is verifiable from outside |

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
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js storefront |
| `pnpm test` | Unit tests (vitest) |
| `pnpm db:seed` | Realistic development data |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | Generate SQL migrations from the schema |
| `pnpm db:migrate` | Apply migrations |
| `psql "$DATABASE_URL" -f scripts/verify-constraints.sql` | Prove the database rejects impossible state |

`scripts/verify-constraints.sql` is worth knowing about: it asserts that the
database itself refuses a Gregorian harvest year, a reservation larger than
stock, a zero price, an unexplained stock movement, and a replayed sale. CI runs
it on every push.

## Conventions worth knowing before you add code

- **Relative imports carry no extension** (`from "../globals/money"`). Turbopack
  does not map a `.js` specifier onto a `.ts` source. Standalone scripts run
  through `tsx` for the same reason.
- **Pages never import drizzle.** `src/modules/catalog/queries.ts` is the only
  door to the database, and it is where the "publicly sellable" filter lives so
  a quarantined lot cannot reach a page by accident.
- **Nothing formats a number at a call site.** Prices, weights, dates and
  percentages go through `src/globals`, which is why the pages render `۸٫۶٪`
  with the Persian decimal separator rather than `۸.۶۰٪` with a Latin dot.
- **Design tokens are the Tailwind theme.** Edit
  `src/globals/styles/globals.css`; there is no `tailwind.config.js`.
