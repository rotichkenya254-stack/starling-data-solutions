# Starling Data Solutions Tanzania

A mobile-first Tanzania data bundle storefront starter for Vodacom, Halotel, Airtel and YAS. Includes customer registration/login, package catalogue, order creation, basic admin APIs and MongoDB models.

## Important: integrations are not live yet

This ZIP is a working application starter, not a live bundle reseller. Real payments and automatic data delivery are deliberately disabled until you have:
1. A legitimate bundle distributor/supplier contract and API documentation covering the networks you intend to sell.
2. An approved Tanzanian payment provider account and API credentials.
3. Verified callback/webhook details and production hosting.

Do not collect customer payments until payment verification and fulfilment are implemented and tested. A browser redirect is not proof of payment.

## Requirements

- Node.js 18+
- MongoDB (local or managed MongoDB Atlas)

## Setup

1. Extract the ZIP.
2. Open a terminal in the project folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env`.
5. Set `MONGODB_URI`, a long random `JWT_SECRET`, and a strong `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
6. Start the app:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

The first administrator account is seeded on startup if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set. Change the example credentials before deployment.

## Included API endpoints

### Public
- `GET /api/health`
- `GET /api/packages`

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token)

### Customer
- `POST /api/orders` (Bearer token)
- `GET /api/orders/mine` (Bearer token)

### Admin (admin Bearer token)
- `GET /api/admin/overview`
- `GET /api/admin/orders`
- `POST /api/admin/packages`
- `PATCH /api/admin/packages/:id`
- `PATCH /api/admin/orders/:id/status`

### Payments / OptimaPay Bridge — Tanzania Global API

- `POST /api/payments/initiate` starts a Tanzania mobile-money collection for an authenticated customer order.
- `GET /api/payments/status/:orderId` checks the transaction using the authenticated OptimaPay Global API.
- `POST /api/payments/callback` acknowledges callbacks but does **not** trust callback payloads as proof of payment.

This integration follows the Tanzania flow in the supplied `server.js`:
- API base: `https://global.optimapaybridge.co.ke/api/v2`
- Authentication headers: `X-API-KEY` and `X-API-SECRET`
- Collection: `POST /godigital/tz/collect`
- Collection payload: `providerCode`, `phone`, `amount`, `reference`, `description`
- Status lookup: `GET /godigital/tz/status/{reference-or-transaction-id}`
- Supported `providerCode` values: `VODACOM`, `YAS`, `AIRTEL`, `HALOTEL`
- Bundle prices are collected directly in TZS; this Tanzania endpoint does not use the Kenya STK Push KES conversion flow.

Configure these server-side environment variables:
- `OPTIMAPAY_GLOBAL_BASE_URL=https://global.optimapaybridge.co.ke/api/v2`
- `TZUG_OPTIMAPAY_API_KEY`
- `TZUG_OPTIMAPAY_API_SECRET`
- `TZUG_OPTIMAPAY_ACCOUNT_ID` (retained as merchant configuration; the Tanzania collection payload shown in the supplied server does not send it)
- `OPTIMAPAY_TANZANIA_ENABLED=true` only after credentials and merchant access are confirmed.

The payer phone is validated as a Tanzanian number and the customer selects the payer network. The server stores a unique merchant reference before making the collection request, then verifies the final provider status. An order is marked paid only when the returned successful status also matches the expected TZS amount and payer phone. An ambiguous network timeout retains the original reference for reconciliation and blocks a duplicate collection request. Callback payloads are not treated as payment proof.

**Important:** API credentials were not supplied, so this ZIP contains the integration code but live checkout is not activated or tested. Confirm the exact response fields in your OptimaPay merchant account before production. Do not expose credentials in browser JavaScript.

## Admin package example

```json
{
  "network": "Vodacom",
  "name": "Daily 1GB",
  "dataAmount": "1 GB",
  "validity": "1 day",
  "priceTzs": 1500,
  "providerProductCode": "SUPPLIER_PRODUCT_CODE"
}
```

Supported network values: `Vodacom`, `Halotel`, `Airtel`, `YAS`.

## Production checklist

- Use HTTPS.
- Set strong environment secrets and rotate them if exposed.
- Restrict CORS to your actual domain.
- Add email/phone verification, password reset and audit logging.
- Add admin UI and granular permissions before public launch.
- Validate supplier and payment webhook signatures server-side.
- Match payment amount, TZS currency, merchant reference and final provider status.
- Make fulfilment idempotent to prevent duplicate bundle delivery.
- Keep payment and supplier credentials only in server environment variables.
- Add monitoring, backups, rate limits and incident logging.


## Deploying on Vercel

This version exports the Express app from the root `server.js` for Vercel's Express detection. Vercel serves files in `public/` as static assets and runs the Express app as a function. No custom `vercel.json` rewrite is required for this Express setup.

1. Push the extracted project to a GitHub repository.
2. In Vercel, choose **Add New → Project**, import the repository, and deploy.
3. In **Project → Settings → Environment Variables**, add:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `JWT_EXPIRES_IN`
   - `ADMIN_NAME`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
4. Redeploy after adding or changing environment variables.
5. Test `https://YOUR-PROJECT.vercel.app/api/health` and then the homepage.

Use a MongoDB Atlas database reachable from Vercel. For Atlas network access, configure an appropriate allowlist for your deployment. A broad `0.0.0.0/0` rule is easier to start with but exposes the database endpoint to connection attempts from anywhere; use a strong database password, least-privilege database user, and a more restrictive/static egress arrangement where available.

Do not enable payments until OptimaPay confirms Tanzanian/cross-border support and the provider status schema has been tested end-to-end. Bundle supplier credentials are separate and must not be added until a legitimate distributor contract and API are available. Payment initiation is implemented for the Tanzania Global API but remains disabled until valid credentials are configured and `OPTIMAPAY_TANZANIA_ENABLED=true`. Automatic data-bundle fulfilment still requires a separate legitimate supplier API and is not implemented.
