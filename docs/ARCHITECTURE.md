# Irice — Proposed Design & Architecture

_Proposal, 2026-09-17. Nothing is built yet: the repo is empty. This is the plan
to start from, sized for a small team shipping a real storefront in weeks._

## 0. The product thesis

Irice is a **mill-direct Iranian rice store where every bag is traceable to a lot
(variety + paddy origin + harvest year + milling batch), priced transparently per
kilogram, and available as a recurring household subscription.**

Two of those three things nobody in the Iranian market is doing as structured
product (see MARKET-REVIEW.md §2.3). The whole architecture below exists to make
lot-level traceability and per-kg pricing cheap to operate, because that is the
differentiator — everything else is a commodity storefront.

## 1. The domain model (the part that matters)

Standard e-commerce schemas model `Product → Variant`. Rice does not fit that,
and forcing it is where these projects go wrong. Rice is an **agricultural
commodity with a vintage**: the same "Tarom Hashemi 10kg" is a different good,
at a different cost, with different stock, depending on harvest year and mill run.

Model it in three layers:

```
Variety          هاشمی، طارم هاشمی، دمسیاه، صدری، فجر، شیرودی، (+ imported basmati)
  └─ Lot         one milling batch: origin, harvest year, grade, moisture,
                 broken-grain %, lab certificate, cost/kg, quantity on hand
       └─ Sku    a pack size cut from a lot: 1 / 5 / 10 / 20 kg, price, barcode
```

- **Variety** is the marketing and SEO entity — the thing a customer searches for
  and the thing that owns content, imagery, cooking guidance. Stable, ~10 rows.
- **Lot** is the inventory and truth entity. Stock lives here, in **grams**, never
  in "units". Provenance attributes live here. A lot is the unit of recall,
  costing, and the QR/traceability page. This is the schema's load-bearing wall.
- **Sku** is the sellable entity: `(lot, pack_size_g)` with its own price. Price
  is stored as **rial integers** (never floats, never Toman in the DB) and is
  always derivable from a `price_per_kg` on the lot plus a packaging delta, so
  a market move is one update, not fifty.

Consequences worth naming up front:
- Reorders and subscriptions bind to a **Variety + pack size**, not a Sku,
  because the lot underneath will change between deliveries. Fulfilment picks
  the active lot at ship time (FEFO — first-expiring-first-out by harvest year).
- Inventory decrements in grams at the lot level, so a 20 kg sale and four 5 kg
  sales are the same movement.
- Price history is an append-only table keyed by lot. It is a feature, not an
  audit log: "this variety, last 12 months" is a trust asset in a market where
  a 10 kg bag is millions of Toman.

Supporting aggregates: `Customer` (phone-number identity), `Address`,
`Cart`, `Order` + `OrderLine` (snapshotting lot id and unit price at purchase
time — never join to live price), `Shipment`, `Payment`, `InstallmentPlan`,
`Subscription`, `Review`, `Certificate` (lab test / origin document attached to a
lot).

## 2. Stack recommendation

**Next.js 15 (App Router) + TypeScript + PostgreSQL + Drizzle ORM, one deployable.**

Not a headless commerce platform (Medusa/Saleor/Shopify), and the reasoning is
specific rather than taste:
1. The catalog is small — tens of varieties, low hundreds of live SKUs. The thing
   these platforms buy you (scalable generic catalog) is the thing we don't need.
2. The thing we *do* need — lot vintages, gram-level inventory, per-kg pricing,
   Iranian installments — is exactly what you'd fight their schema over.
3. Every local integration (Shaparak/ZarinPal, Kavenegar, Tipax/Post, eNamad,
   Jalali dates, کالابرگ) is custom work regardless of platform.

Revisit this only if the catalog becomes a multi-vendor marketplace.

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js App Router, RSC-first | SEO is the acquisition channel; variety pages must be statically rendered and fast on mobile |
| Language | TypeScript, `strict` | Money and weight bugs are the expensive class here |
| DB | PostgreSQL | Transactional inventory; `numeric`/`bigint` money; JSONB for lot attributes |
| ORM | Drizzle | SQL-shaped, cheap to reason about in transactions; Prisma is an acceptable swap |
| Styling | Tailwind with `dir="rtl"` logical properties | RTL-first, not RTL-retrofitted |
| Auth | Phone + OTP (Kavenegar), session cookies | Iranian users expect it; email-first would leak conversions |
| Payments | Adapter interface, ZarinPal first | Redirect + verify callback; never assume card-on-file |
| Media | S3-compatible object storage (ArvanCloud/local) | Lot certificates and photos |
| Search | Postgres FTS with a Persian config | Full search engine is premature at this catalog size |
| Jobs | pg-backed queue (pg-boss) | Subscriptions, price alerts, installment reminders — no extra infra |
| Admin | Same app, `/admin`, role-gated | Ops team is small; a separate SPA is waste |

## 3. Module boundaries

A modular monolith. One deployable, hard internal seams, so anything can be
extracted later if it earns it.

```
src/
  modules/
    catalog/       varieties, lots, skus, certificates, media
    pricing/       price-per-kg engine, price history, campaign/discount rules
    inventory/     gram-level ledger, reservations, FEFO lot selection
    cart/          cart aggregate, weight+price recalculation
    checkout/      order placement, the one big transaction
    payments/      PaymentProvider interface + zarinpal adapter
    installments/  plan generation, schedule, reminders
    shipping/      weight×zone rate engine, carrier adapters, tracking
    subscriptions/ recurring plans, next-delivery scheduling, skip/pause
    identity/      phone OTP, sessions, addresses, roles
    orders/        lifecycle, returns (10-day guarantee), refunds
    content/       variety guides, recipes, blog — SEO surface
    admin/         ops UI over the above
  globals/         see §5
```

Rules: modules talk through exported service functions, never by importing each
other's tables. `checkout` is the only module allowed to open a multi-module
transaction. `pricing` is pure — no I/O — so it is exhaustively testable.

## 4. The three flows that carry the risk

**Checkout** must be one Postgres transaction: reserve inventory (row-locked lot
ledger) → snapshot prices onto order lines → create order `pending_payment` →
commit → *then* redirect to the gateway. Payment verification is a separate
idempotent callback keyed by authority/ref-id; it can arrive twice, late, or
never. A reservation expires on a timer and returns grams to the lot. Never
decrement stock in the callback.

**Shipping** is weight-first, not item-first. A 20 kg bag is the whole cost model.
The rate engine is `f(total_grams, destination_zone, service) → rial`, with
free-shipping thresholds expressed in rial and configured per zone. Get this
wrong and margin quietly disappears — it is the single most common failure mode
for staple-goods D2C.

**Installments** need an explicit `InstallmentPlan` aggregate (principal,
instalment count, schedule in Jalali dates, paid/outstanding per instalment,
reminder job). Do not model instalments as partial payments on the order; the
schedule outlives the order lifecycle and drives its own notifications.

## 5. The globals layer

Since there is no `globals` file yet, here is what it should be — this is
deliberately a *module*, not a stylesheet with variables in it:

```
globals/
  money.ts      rial integers; toToman()/format(); NEVER float arithmetic
  weight.ts     grams as the only unit; kg formatting at the edges
  date.ts       Jalali (jalaali-js) conversion; DB stores UTC timestamptz only
  digits.ts     Persian/Arabic numeral rendering + input normalisation
  i18n.ts       fa-IR dictionary, message catalog; en-US stub for the export site
  rtl.ts        direction context, logical-property helpers
  config.ts     env parsing with zod — fails loudly at boot, not at 3am
  errors.ts     typed domain errors + a single mapping to HTTP responses
  styles/globals.css   design tokens only: color/spacing/type scale, dark mode,
                       Persian webfont (Vazirmatn) with correct font-display
```

The non-negotiables in that list: **money is an integer in rials everywhere**,
**weight is grams everywhere**, **timestamps are UTC in the DB and Jalali only at
render time**, and **user-typed Persian digits are normalised on input**. Every
one of these has a well-known failure mode in Iranian apps and every one is free
to get right on day one and expensive on day two hundred.

## 6. Delivery plan

_Status: phases 0–2 are built. Sections below are the plan as written;
deviations made while building are recorded in §8._

| Phase | Scope | Done when |
|---|---|---|
| 0 — Foundation ✅ | Repo, TS config, Postgres, Drizzle schema for Variety/Lot/Sku, globals layer, CI | `pnpm test` + migrations run green in CI |
| 1 — Catalog & SEO ✅ | Variety pages, lot traceability page, content model, sitemap, structured data | A customer can find "برنج هاشمی" on Google and read the lot's harvest year |
| 2 — Commerce core ✅ | Cart, phone OTP, weight-based shipping, ZarinPal checkout, gamification | A real order can be placed, paid, and shows up in the customer's Rice Passport |
| 3 — Trust & local fit | eNamad, 10-day return flow, lab certificates, price history charts, reviews | Parity with the specialist competitors |
| 4 — Differentiators | Subscriptions, installment plans, per-kg price transparency, QR on the bag | The two things the market doesn't have |
| 5 — Channels | Digikala/Snapp/Okala feed export, B2B/bulk tier, optional export storefront (en) | Marketplace listings generated from the same catalog |

Phase 4 is the reason for the whole schema in §1. Don't let it slip to "later" —
if the lot model isn't exercised by a real feature it will rot into a metadata blob.

## 7. Decisions I'd want confirmed before coding

1. **Market**: domestic Iran only for v1, or domestic + diaspora export from day one? Export changes currency, payments, and compliance materially.
2. **Supply**: own mill / fixed partner mills, or aggregating many sellers? Multi-vendor invalidates the single-tenant assumptions above.
3. **Installments**: in-house schedule, or an external BNPL provider?
4. **Marketplace strategy**: is Digikala a channel from the start, or is D2C exclusive for brand reasons?

## 8. Decisions changed while building

Recorded here rather than silently edited above, so the reasoning survives.

**Tailwind is configured through the token file, not a JS config** (phase 1).
Tailwind v4 takes its theme from CSS, so `src/globals/styles/globals.css`
declares the tokens inside `@theme` and is simultaneously the design-token file
§5 calls for and the Tailwind theme. One definition; a token and its utility
cannot drift apart. Dark mode re-points the same custom properties, so utilities
follow without a `dark:` prefix on every element.

**Relative imports carry no extension** (phase 1). The codebase originally used
the TypeScript-recommended `./money.js` form. Turbopack does not map a `.js`
specifier onto a `.ts` source, so the first `next build` failed on every
internal import. Extensionless is the one form that Next, vitest and tsx all
resolve. Standalone scripts run through `tsx` for the same reason — bare
`node --experimental-strip-types` will not resolve them.

**Catalog pages revalidate rather than statically generating per lot.** The plan
implied `generateStaticParams`. Lot passports are unbounded and grow with every
harvest, and prices move weekly, so variety and passport pages render on demand
with a revalidation window (5 minutes for catalog, 1 hour for a passport, which
is near-immutable once shipped). The index is prerendered at build time, which
is why CI seeds the database before `pnpm build`.

**The lot passport ignores lot status on purpose.** Every other catalog query
filters to `active` lots with free stock. `getLotPassport` does not: someone
holding a bag from a depleted — or recalled — lot still has the right to read
its provenance. That is the promise the QR code makes. Only the *sale* of a lot
is gated by status.

**Order/payment SMS was descoped from phase 2.** The delivery-plan table's
"order emails/SMS" line didn't ship — Kavenegar's OTP template is wired up
(see identity/sms.ts) but no order-confirmation notification was built. Not
a hidden gap: it's next on the list once phase 3 needs a real notification
channel anyway (return status, fulfilment updates).

## 9. Phase 2: commerce, gamification, and three bugs no unit test would have caught

**The gamification design.** The Rice Passport reuses the lot passport's own
metaphor, literalised as a customer-facing collectible: a stamp per variety
tried, a badge per origin province, a Jalali-month purchase streak, a
cumulative-kg loyalty tier, and points earned/redeemable at checkout. It is
built on the exact pattern the stock ledger already established — an
append-only truth table (`loyalty_ledger`, `customer_badges`) with a cache
column beside it (`customers.points_balance_cache`,
`total_kg_purchased_cache`) recomputed from real order history after every
paid order, never incremented speculatively. `evaluateBadges` is a pure
function over that history and is provably monotonic (a test asserts a
strictly larger history never loses a badge already unlocked), which is what
makes "insert only the newly-earned codes" safe to run on every payment,
including a retried one.

**Points are reserved at checkout, not at payment.** Symmetric with stock:
redemption debits the ledger the moment an order is placed (`redeem_checkout`),
and if that order's hold later expires or is cancelled without paying, a
`refund_checkout` entry reverses it — the same "reserve now, consume or
release later" shape `stock_reservations` uses for grams.

**A migration-generation bug, twice.** Drizzle-kit's generated SQL for
changing an enum's value set (cast the column to `text`, drop the old type,
recreate it, cast back) leaves a pre-existing CHECK constraint on that column
referencing the old enum type in its stored expression, and Postgres rejects
the intermediate `text` cast against it. Hit once removing values from
`stock_movement_reason` in this phase's own schema work; hand-fixed both
times by dropping the constraint before the swap and recreating it identically
after. Worth knowing before the next enum edit.

**In-memory module state does not reliably work across Next.js's bundling.**
Two separate features broke this way before anything reached a browser test:
a dev-only OTP-peek endpoint (a `Map` written by a Server Action, read by a
Route Handler) and the fake payment gateway's chosen outcome (same shape:
written by one route type, read by another). Next bundles Server Actions and
Route Handlers into separate chunks; a module-level `Map` gets a separate
instance per chunk, so a write in one is invisible to a read in the other —
silently, with no error, just an eternally-empty lookup. Both were fixed by
moving the state into the database (`otp_codes.dev_plaintext_code`,
`fake_payment_outcomes`) instead of process memory. **Neither bug was caught
by the 226 unit and integration tests** — they only run inside one Node
process, where a plain Map has no such split. Only the end-to-end test driving
a real built-and-started server against a real browser (`pnpm test:e2e`)
caught them, which is the whole reason that test exists and is wired into CI
rather than being a one-off manual check.

**A real correctness bug: an attempt counter erased by its own rejection.**
`verifyOtp`'s wrong-code path incremented `otp_codes.attempts` and then threw
a `DomainError` — from inside the same `db.transaction()` callback. Throwing
inside a transaction rolls back everything the callback did, including the
very increment meant to survive the rejection, so the attempt limit could
never actually trigger. Fixed by having the transaction always commit
(returning an outcome value) and throwing from the caller, outside any
transaction. A test asserts the lockout now fires after
`OTP_MAX_ATTEMPTS` real wrong guesses, not just that one guess increments a
counter in isolation.

**A cookie edge case specific to the fake payment gateway, not the real one.**
The fake gateway's buttons were originally `<form action={serverAction}>`
elements whose action called `redirect()` into `/pay/callback`, which itself
redirects into `/orders/[id]` — a POST that triggers a same-app redirect
chain. Chromium's SameSite=Lax cookie policy has a real, reproduced-with-curl
edge case there: cookies were dropped specifically on the final hop, landing
the customer on their own paid order page logged out. Fixed by making the
fake gateway's buttons plain GET links to a route that records the outcome
and redirects, matching the shape the *real* ZarinPal flow already has (an
external site issuing a plain GET redirect to `/pay/callback`) — the real
flow was never at risk; only the local simulation of it was.

**React state derived from a prop needs an explicit sync.**
`CheckoutForm`'s `useState(defaultAddressId ?? "")` only reads that initial
value on mount. Adding a customer's *first* address flips `defaultAddressId`
from `undefined` to a real id on the next server render, but the client
component instance stays mounted at the same tree position, so the state
never updated and the submit button stayed permanently disabled. Fixed with
a `useEffect` that syncs it explicitly.
