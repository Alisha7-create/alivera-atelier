# Alivèra Atelier — Cloudflare deployment

This project has been converted from Hatchable to Cloudflare Workers + Workers Static Assets + D1 + R2.

## 1. Install Wrangler

```bash
npm install
```

## 2. Log in

```bash
npx wrangler login
```

## 3. Create the Cloudflare resources

The `wrangler.jsonc` file declares:

- Worker: `alivera-atelier`
- D1: `alivera-atelier-db`
- R2: `alivera-atelier-media`
- Static assets: `public/`

If Wrangler asks to create these resources, approve the creation.

## 4. Apply the D1 migration

```bash
npx wrangler d1 migrations apply DB --remote
```

The migration creates the products/orders/customer/admin data model and seeds the four current products.

## 5. Add production secrets

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET
npx wrangler secret put RESEND_API_KEY
```

`AUTH_SECRET` should be a long random value.

`ADMIN_EMAILS` is currently set to `contact@aliveraatelier.in` in `wrangler.jsonc`. Add additional owner emails there if needed.

## 6. Deploy

```bash
npx wrangler deploy
```

Test the generated `workers.dev` URL before changing the domain.

## 7. Connect aliveraatelier.in

In Cloudflare, open **Workers & Pages → alivera-atelier → Settings → Domains & Routes** and add:

- `aliveraatelier.in`
- `www.aliveraatelier.in`

Do not delete the existing DNS zone. Cloudflare will attach the Worker to the domain.

## 8. Important asset note

The ZIP does not contain Hatchable's private object-storage bytes. The four product records have been migrated, but their old Hatchable image/size-chart files are intentionally not stored as expiring Hatchable signed URLs.

After deployment, log into `/admin` and upload the product photos and size charts again. New uploads go to Cloudflare R2 and remain available through the Cloudflare media endpoints.

## 9. Payment/email configuration

Razorpay and Resend are wired through Worker secrets. Do not put these secret values in `public/` or commit them to Git.

## 10. Architecture

Browser → Cloudflare Worker → D1 / R2 / Razorpay / Resend

The storefront remains under `public/`, while API routes run through the Worker.


## Customer Stories — 24-hour expiry

Customer stories are now Instagram-style:
- A published story is visible publicly for 24 hours from its `created_at` timestamp.
- The public `/api/stories` endpoint immediately stops returning stories older than 24 hours.
- A Cloudflare Cron trigger runs every 15 minutes and permanently deletes expired story rows and their associated R2 media.
- Stories are not archived; after 24 hours they are deleted.


## Customer story moderation
Customer story uploads are checked inline with Cloudflare Workers AI before being stored. The image check uses Moondream 3.1 and the caption check uses Llama Guard 3. Unsafe submissions are not stored and the customer receives an immediate community-guidelines warning. Published stories remain public for 24 hours and are then deleted, including their R2 media. Workers AI is bound as `AI` in `wrangler.jsonc`.
