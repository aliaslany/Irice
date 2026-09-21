# Deploying Irice

The app needs a real persistent filesystem (certificate uploads — see
`modules/certificates/storage.ts`) and runs Postgres itself, so it targets a
plain VPS running `next start`, not a serverless platform like Vercel.

## Cheapest fit-for-purpose option

A **~€4/mo VPS** (Hetzner CX22, or a comparable DigitalOcean/Vultr droplet:
2 vCPU / 4GB RAM / 40GB disk, Ubuntu 24.04) running Next.js and Postgres on
the same box. This beats any managed-Postgres + serverless-web combination
on price, and matches what the app already assumes.

## First deploy

1. **Create the server.** Hetzner Cloud → new server → Ubuntu 24.04 → the
   cheapest shared-vCPU plan → add your SSH key. Note the server's IP.
2. **(Optional, recommended before a real launch) Point a domain at it.**
   An A record for `shop.example.com` → the server's IP. Caddy (installed by
   the script below) issues HTTPS automatically once that resolves.
3. **SSH in and run the bootstrap script:**

   ```bash
   ssh root@<server-ip>
   git clone --branch main https://github.com/aliaslany/Irice.git /tmp/irice-setup
   cd /tmp/irice-setup
   DOMAIN=shop.example.com bash deploy/setup.sh   # omit DOMAIN to test over plain HTTP first
   ```

   This installs Postgres, Node, pnpm and Caddy; creates a `irice` system
   user and database; clones the app to `/opt/irice/app`; generates a
   `SESSION_SECRET`, `ADMIN_TOKEN`, and database password (never typed by
   hand, never in this repo); runs migrations; builds; and starts the app
   as a systemd service (`irice.service`) behind Caddy's automatic HTTPS.

4. **Read your credentials once, then delete the file:**

   ```bash
   cat /root/IRICE_CREDENTIALS.txt   # admin token + DB password — save them, then rm this file
   ```

5. **Optional: seed sample catalog data** (skip this for a real launch —
   seed the *real* varieties and lots instead, either by hand through SQL
   or a future admin form):

   ```bash
   cd /opt/irice/app
   sudo -u irice env $(grep -v '^#' /etc/irice/irice.env | xargs) pnpm db:seed
   ```

6. Visit the site. `/admin/login` with the token from step 4 gets you into
   the returns/certificates/fulfilment surface.

## Before this can take real orders

Two things gate a *real* launch, independent of hosting — both require a
real registered business in Iran, same as eNamad:

- **`ZARINPAL_MERCHANT_ID`** — without it, checkout silently uses the fake
  payment gateway (`modules/payments/fake.ts`). No real money moves. Get a
  merchant id from your ZarinPal dashboard once your business account is
  approved, add it to `/etc/irice/irice.env`, then `systemctl restart irice`.
- **`KAVENEGAR_API_KEY`** — without it, OTP login codes are only logged
  server-side (`journalctl -u irice`), never sent to a real customer's
  phone. Get an API key from Kavenegar, add it the same way.

Optionally, once registered at enamad.ir: `ENAMAD_ID` / `ENAMAD_CODE` (see
`components/EnamadBadge.tsx` — the footer shows nothing without them,
never a placeholder).

## Redeploying after a code change

```bash
ssh root@<server-ip>
cd /opt/irice/app && bash deploy/deploy.sh
```

Pulls the latest commit on `main`, reinstalls, migrates, rebuilds, restarts
the service. `deploy/setup.sh` is also safe to re-run in full (it skips
already-done steps and reuses existing secrets/passwords).

## Operating it

- **Logs**: `journalctl -u irice -f`
- **Restart**: `systemctl restart irice`
- **Backups**: this is a real Postgres database with real orders in it from
  day one — set up `pg_dump` on a cron before real traffic arrives. Not
  included here; ask for it when you're ready to wire it up.
- **The `irice_prod` database and `/opt/irice/app/var/certificates` uploads
  directory are the only state that matters** — back up both.
