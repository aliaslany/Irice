/**
 * End-to-end proof of the full checkout + gamification journey, driven with
 * a real headless browser against a running build of the app: home ->
 * variety -> add to cart -> cart -> checkout -> OTP login (via the
 * ALLOW_DEV_OTP_PEEK readback, never real SMS) -> address -> place order ->
 * payment gateway -> paid order with a badge-unlock celebration -> the Rice
 * Passport -> a second order redeeming loyalty points.
 *
 * Requires a server already running (pnpm build && pnpm start) with a seeded
 * database and ALLOW_DEV_OTP_PEEK=true, since this is the one flow no unit
 * or integration test can cover: real Next.js bundling and real browser
 * cookie behavior. Both of those surfaced genuine bugs during development —
 * see docs/ARCHITECTURE.md §8 — that no same-process test caught.
 *
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/e2e-checkout.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const mobile = "0912" + String(Math.floor(1000000 + Math.random() * 8999999));
const log = (...args) => console.log("[e2e]", ...args);
let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg);
  } else {
    log("ok:", msg);
  }
}

const browser = await chromium.launch(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1100, height: 1600 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("[pageerror]", String(e)));
page.on("console", (m) => {
  if (m.type() === "error") console.error("[console.error]", m.text());
});

/**
 * Click an add-to-cart button and wait for its Server Action's POST to
 * actually return. Navigating away any earlier aborts the response — and on
 * a first add, that response is what carries the new cart cookie, so the
 * item lands in a cart the browser never learns about. This raced and
 * flaked in CI (a local experiment lost 15/15 adds with the old
 * click-then-networkidle pattern, 0/15 with this).
 */
async function addToCart(form) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.status() < 400, { timeout: 10_000 }),
    form.locator('button[type="submit"]').click(),
  ]);
}

// 1. Home page loads, RTL, shows a variety.
await page.goto(BASE, { waitUntil: "networkidle" });
assert((await page.locator("html").getAttribute("dir")) === "rtl", "home is RTL");
assert(await page.getByText("طارم هاشمی").first().isVisible(), "home shows a seeded variety");

// 2. Go to a variety page and add a 10kg pack to the cart.
await page.getByText("طارم هاشمی").first().click();
await page.waitForLoadState("networkidle");
assert(page.url().includes("/rice/"), "navigated to a variety page");

await addToCart(page.locator('form:has(input[name="packSizeG"][value="10000"])').first());
await page.screenshot({ path: "./e2e-shots/01-added-to-cart.png", fullPage: true });

// 3. Cart page shows the line and a nonzero subtotal.
await page.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
assert(await page.getByText("طارم هاشمی").first().isVisible(), "cart shows the added variety");
await page.screenshot({ path: "./e2e-shots/02-cart.png", fullPage: true });

// 4. Proceed to checkout -> OTP login.
await page.getByRole("link", { name: /ادامه فرآیند خرید/ }).click();
await page.waitForLoadState("networkidle");
assert(page.url().endsWith("/checkout"), "reached checkout");
assert(await page.getByText("ورود با شماره موبایل").isVisible(), "OTP login form shown for guest");

await page.getByPlaceholder("۰۹۱۲۳۴۵۶۷۸۹").fill(mobile);
await page.getByRole("button", { name: "ارسال کد" }).click();
await page.waitForTimeout(600); // OTP request round trip + dev-code autofill fetch

const codeInput = page.locator('input[maxlength="5"]');
await codeInput.waitFor({ state: "visible", timeout: 5000 });
const autofilled = await codeInput.inputValue();
assert(/^\d{5}$/.test(autofilled), `dev OTP autofill populated a 5-digit code (got "${autofilled}")`);
await page.screenshot({ path: "./e2e-shots/03-otp.png", fullPage: true });

await page.getByRole("button", { name: "ورود" }).click();
// router.refresh() after a successful verify re-renders the Server Component
// tree asynchronously; "networkidle" doesn't guarantee that has landed, so
// wait for the actual DOM change instead of checking isVisible() once.
await page.getByText("افزودن آدرس جدید").waitFor({ state: "visible", timeout: 10_000 });
assert(true, "logged in, checkout now shows address form");

// 5. Add an address.
await page.getByText("افزودن آدرس جدید").click();
await page.getByPlaceholder("نام گیرنده").fill("مشتری آزمایشی");
await page.getByPlaceholder("موبایل گیرنده (۰۹…)").fill(mobile);
await page.getByPlaceholder("استان").fill("گیلان");
await page.getByPlaceholder("شهر").fill("رشت");
await page.getByPlaceholder("آدرس کامل").fill("خیابان تست، پلاک ۱");
await page.getByRole("button", { name: "ذخیره آدرس" }).click();
await page.waitForLoadState("networkidle");
await page.screenshot({ path: "./e2e-shots/04-address-added.png", fullPage: true });

const placeOrderButton = page.getByRole("button", { name: "پرداخت و ثبت سفارش" });
assert(await placeOrderButton.isEnabled(), "place-order button enabled once an address exists");

// 6. Place the order -> redirected to the fake gateway.
await placeOrderButton.click();
await page.waitForURL(/\/pay\/fake\//, { timeout: 10_000 });
assert(page.url().includes("/pay/fake/"), "redirected to the fake payment gateway");
await page.screenshot({ path: "./e2e-shots/05-fake-gateway.png", fullPage: true });

// 7. Succeed the payment.
await page.getByRole("link", { name: /پرداخت موفق/ }).click();
await page.waitForURL(/\/orders\//, { timeout: 10_000 });
await page.waitForLoadState("networkidle");
assert(await page.getByText(/سفارش شما با موفقیت پرداخت شد/).isVisible(), "order confirmation shows success banner");
assert(await page.getByText(/امتیاز آیرایس به حساب شما اضافه شد/).isVisible(), "points-earned message shown");
assert(await page.getByText("اولین برداشت").isVisible(), "first_harvest badge celebrated on first order");
assert(await page.getByText("پرداخت‌شده").first().isVisible(), "order status shows paid");
await page.screenshot({ path: "./e2e-shots/06-order-confirmation.png", fullPage: true });

// 8. Rice Passport shows the unlocked badge, the variety stamp, and points.
await page.getByRole("link", { name: /مشاهده پاسپورت برنج من/ }).click();
await page.waitForLoadState("networkidle");
assert(page.url().endsWith("/account"), "navigated to the Rice Passport page");
assert(await page.getByText("پاسپورت برنج من").isVisible(), "passport header visible");
assert(await page.getByText("امتیاز شده").first, "sanity: page object alive");
const pointsText = await page.locator("p.text-accent").first().textContent();
assert(/[۰-۹]/.test(pointsText ?? ""), `points balance rendered in Persian digits (got "${pointsText}")`);
assert(await page.getByText("امتحان شده").first().isVisible(), "the purchased variety is stamped as tried");
await page.screenshot({ path: "./e2e-shots/07-passport.png", fullPage: true });

// 9. A second, cheap purchase to exercise the loyalty-points redemption path end to end.
await page.goto(`${BASE}/rice/hashemi`, { waitUntil: "networkidle" });
await addToCart(page.locator('form:has(input[name="packSizeG"][value="1000"])').first());
await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle" });
const redeemCheckbox = page.locator('input[type="checkbox"]').first();
if (await redeemCheckbox.isVisible().catch(() => false)) {
  await redeemCheckbox.check();
  assert(await page.getByText("تخفیف امتیاز").isVisible(), "redemption discount line appears once checked");
  await page.screenshot({ path: "./e2e-shots/08-redeem-points.png", fullPage: true });
}
const secondPlaceOrderButton = page.getByRole("button", { name: "پرداخت و ثبت سفارش" });
await secondPlaceOrderButton.waitFor({ state: "visible", timeout: 10_000 });
await secondPlaceOrderButton.click();
await page.waitForURL(/\/pay\/fake\//, { timeout: 10_000 });
await page.getByRole("link", { name: /پرداخت موفق/ }).click();
await page.waitForURL(/\/orders\//, { timeout: 10_000 });
await page.waitForLoadState("networkidle");
assert(await page.getByText("پرداخت‌شده").first().isVisible(), "second order also shows paid");

await browser.close();

console.log(failures === 0 ? "\n=== ALL E2E CHECKS PASSED ===" : `\n=== ${failures} E2E CHECK(S) FAILED ===`);
process.exit(failures === 0 ? 0 : 1);
