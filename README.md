# Irice

Mill-direct Iranian rice, sold by the kilogram with every bag traceable to its lot.

Phases 0–3 of [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the domain
foundation (Variety → Lot → SKU, the globals layer, pricing and FEFO), the
public catalog (variety pages, the lot passport, the SEO surface), a full
commerce and gamification layer — cart, phone-OTP login, weight-based
shipping, a checkout that reserves stock and takes payment, and a **Rice
Passport**: variety stamps, provenance badges, purchase streaks, loyalty
tiers, and redeemable points — and the trust surface: a 10-day return flow,
verified-purchase reviews, lab certificates, a price-history chart on every
lot, and a minimal token-gated admin surface to operate all three.

- [docs/MARKET-REVIEW.md](docs/MARKET-REVIEW.md) — Iranian and international sellers, and where the gap is
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the design this implements

## Getting started

```bash
pnpm install
cp .env.example .env      # then set DATABASE_URL and ADMIN_TOKEN; SESSION_SECRET
                          # gets a random dev value automatically if left blank
pnpm db:migrate
pnpm db:seed              # realistic varieties and lots to develop against
pnpm dev                  # http://localhost:3000
```

`ADMIN_TOKEN` gates `/admin/*` (returns, certificates, fulfilment) — see
`modules/admin/auth.ts` for why it's one shared token rather than real
accounts. `ENAMAD_ID`/`ENAMAD_CODE` stay blank until the business has
actually registered at enamad.ir; until then the footer shows no trust
badge at all, never a placeholder.

The seed deliberately includes two lots of طارم هاشمی from different harvest
years. That is the case FEFO ordering and the freshness badge exist for, and a
single-lot fixture would never exercise it.

To actually log in without a real SMS provider, set `ALLOW_DEV_OTP_PEEK=true`
in `.env` — it exposes `GET /api/dev/last-otp?mobile=...` so a dev script (or
`pnpm test:e2e`) can read the code back instead of watching server logs.
**Never set this on anything a real customer can reach** — see the flag's
comment in `src/globals/config.ts`.

## Pages

| Route | What it is |
|---|---|
| `/` | Variety index: price-from and freshness per variety |
| `/rice/[slug]` | Variety page — sellable lots in FEFO order, each pack size priced, with effective rial/kg, plus verified-purchase reviews |
| `/lot/[code]` | **Lot passport**: the QR target. Origin, mill, harvest year, grade, lab certificates, a price-history chart |
| `/sitemap.xml`, `/robots.txt` | Includes every lot passport — the traceability claim is verifiable from outside |
| `/cart`, `/checkout` | Cart with a free-shipping progress bar; checkout with inline OTP login, address, and loyalty-points redemption |
| `/pay/fake/[authority]` | The fake payment gateway used whenever `ZARINPAL_MERCHANT_ID` is unset (the default) — see modules/payments |
| `/orders/[id]` | Order status, a badge-unlock celebration after a first payment, and a return request once the order is fulfilled |
| `/account` | **The Rice Passport**: points balance, loyalty tier with a progress bar, purchase streak, variety stamps, and the full badge grid |
| `/admin/*` | Token-gated operator surface: approve/reject returns, attach lab certificates, mark orders fulfilled — see `modules/admin/auth.ts` |

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

## Commerce and gamification, briefly

Checkout follows the same "reserve now, consume or release later" shape stock
already used, applied twice more:

- **Stock**: `placeOrder` allocates FEFO packs and creates a
  `stock_reservations` row per (lot, cart line) — never touching `on_hand`.
  Payment success converts a reservation into a `sale` stock_movement
  (`on_hand` finally decreases); failure or expiry releases it.
- **Loyalty points**: redemption debits `loyalty_ledger` at the *same moment*
  the order is placed, not at payment. If the order never converts, a
  `refund_checkout` entry reverses it. Points are only *earned* once payment
  verifies.
- **Badges**: `evaluateBadges` (modules/loyalty/badges.ts) is a pure function
  over a customer's whole paid-order history — it is provably monotonic, so
  running it again after every payment (including a retried one) only ever
  adds newly-qualifying badge codes to `customer_badges`, never revokes one.

Payment verification (`modules/checkout/checkout.ts`) is the part built with
the most care: it's idempotent against a replayed gateway callback, it never
holds a database transaction open across the gateway's own HTTP call, and
`docs/ARCHITECTURE.md §9` documents three real bugs that surfaced only when
this was actually run end-to-end in a browser — worth reading before touching
that file.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js storefront |
| `pnpm test` | Unit + integration tests (vitest; needs `DATABASE_URL`) |
| `pnpm test:e2e` | Full checkout journey in a real browser against a running build — see below |
| `pnpm db:seed` | Realistic development data |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | Generate SQL migrations from the schema |
| `pnpm db:migrate` | Apply migrations |
| `psql "$DATABASE_URL" -f scripts/verify-constraints.sql` | Prove the database rejects impossible state |

`scripts/verify-constraints.sql` is worth knowing about: it asserts that the
database itself refuses a Gregorian harvest year, a reservation larger than
stock, a zero price, an unexplained stock movement, a replayed sale, a
discount exceeding its own order, a duplicate badge unlock, a rating outside
1–5, a second review from the same customer on the same variety, and a
negative refund. CI runs it on every push.

`pnpm test:e2e` (`scripts/e2e-checkout.mjs`) needs a server already running
(`pnpm build && pnpm start`) with `ALLOW_DEV_OTP_PEEK=true` and a seeded
database — it drives the *entire* journey (cart → OTP login → address →
payment → badge celebration → Rice Passport → a second order redeeming
points) with Playwright. It exists because three real bugs during phase 2
(a Next.js bundling gotcha, a browser cookie edge case, a React stale-state
bug) were invisible to 226 passing unit and integration tests and only
surfaced against a real built server in a real browser — see
`docs/ARCHITECTURE.md §9`.

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
- **No module-level in-memory state that a Server Action writes and a Route
  Handler reads, or vice versa.** Next bundles them separately; a plain `Map`
  gets a silent, separate instance per bundle. Put shared state in the
  database — see `otp_codes.dev_plaintext_code` and `fake_payment_outcomes`
  for the two places this actually bit us.
- **Only a Server Action or Route Handler may set a cookie.** A page render
  (`getCurrentCustomer`, `getCartSummary` in `src/app/lib/session.ts`) is
  read-only, by construction, so an anonymous page view never creates a
  database row.
- **Never write a runtime upload under `public/`.** `next start` serves
  `public/` from a static-asset list resolved at boot, so a file written
  there while the server is already running 404s until the next restart —
  reproduced by hand once, see `docs/ARCHITECTURE.md §10`. Certificate
  uploads live in `var/certificates/` and are served through an explicit
  route handler that reads the file fresh on every request instead.
