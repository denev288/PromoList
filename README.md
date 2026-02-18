# promo-list-bg

MVP project with **Next.js App Router + TypeScript + Tailwind + Prisma + PostgreSQL**.

Goal: keep a personal shopping list and compare current promotions from Lidl/Kaufland/Billa using an external API (`sofia-supermarkets-api`).

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Prisma ORM
- PostgreSQL (Docker Compose)

## Project Tree

```text
promo-list-bg/
  frontend/
    src/
      app/
        api/
          deals/route.ts
          items/route.ts
          items/[id]/route.ts
        deals/page.tsx
        my-list/page.tsx
        layout.tsx
        page.tsx
        globals.css
      components/
        main-nav.tsx
      views/
        home-page.tsx
        my-list-page.tsx
        deals-page.tsx
    public/
    next.config.ts
    tsconfig.json
  backend/
    prisma/
      schema.prisma
      seed.ts
      migrations/
    scripts/
      refresh-offers.ts
    src/
      lib/
        matching.ts
        offersIngestion.ts
        prisma.ts
        store.ts
        supermarketsApi.ts
        text.ts
  docker-compose.yml
```

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Start PostgreSQL:

```bash
npm run db:up
```

3. Run first migration:

```bash
npm run db:migrate -- --name init
```

4. Seed stores (Lidl/Kaufland/Billa):

```bash
npm run db:seed
```

5. Start app:

```bash
npm run dev
```

6. Open:

- `http://localhost:3000/my-list`
- `http://localhost:3000/deals`

## Environment

Use the same values in both `.env` (backend scripts/prisma) and `frontend/.env` (Next app):

```bash
DATABASE_URL="postgresql://promo:promo@localhost:5432/promo_list_bg?schema=public"
SUPERMARKETS_API_BASE_URL="http://localhost:8080"
```

## External API Adapter (Swagger-aware)

Adapter file: `backend/src/lib/supermarketsApi.ts`

Implemented contract:

- `searchOffers(query: string, stores: Store[]): Promise<ExternalOffer[]>`
- `healthCheck(): Promise<boolean>`

Current behavior:

- Reads base URL from `SUPERMARKETS_API_BASE_URL`.
- Uses generic `fetchJSON` helper.
- Tries to discover a search endpoint from OpenAPI docs (`/v3/api-docs`, `/api-docs`) with heuristics.
- Maps response payload best-effort (`offers/items/products/results/data`).
- Returns `[]` if endpoint discovery/mapping fails.

### IMPORTANT TODO for real integration

Do not rely on heuristics long-term. After checking swagger, lock the exact endpoint and params.

1. Start external API (Kotlin/Spring Boot) on `http://localhost:8080`.
2. Open `http://localhost:8080/swagger-ui.html`.
3. Identify exact search endpoint/method and payload/query params.
4. Update these locations in `backend/src/lib/supermarketsApi.ts`:
   - `findSearchRequestInDoc`
   - `executeSearch`
   - `mapExternalOffer`
5. Re-test with:

```bash
npm run refresh:offers
```

## MVP Features

### UI

- **My List**
  - add item (`name`, `type`, optional `preferredQuery`)
  - delete item
  - toggle favorite
  - update type/preferred query
- **Deals**
  - filter by store (Lidl/Kaufland/Billa)
  - sort by price or score
  - generic item -> top 5 cheapest
  - preferred item -> closest matches first, then alternatives

### API Routes

- `POST /api/items`
- `GET /api/items`
- `DELETE /api/items/:id`
- `PATCH /api/items/:id`
- `GET /api/deals`

`GET /api/deals` behavior:

- Reads matches from local DB first.
- If no matches for an item, triggers on-demand refresh from external API with:
  - simple rate limit (`1 request / 500ms`)
  - in-memory search cache
  - basic retry
- If external API is not configured/unavailable, returns empty deals.

UI fallback message: **"No deals yet - run refresh:offers"**.

## Ingestion Job

Script: `backend/scripts/refresh-offers.ts`

Run manually:

```bash
npm run refresh:offers
```

Flow:

- loads all `ListItem`
- requests external offers via adapter
- upserts offers (`Offer` with fingerprint)
- computes score/reason and upserts `OfferMatch`

## Future Cron

Later you can automate `refresh:offers` via:

1. GitHub Actions scheduled workflow
2. Vercel Cron hitting a protected endpoint or running a job worker

## Notes

- Matching is rule-based (no ML): normalization, token overlap, Jaccard, brand bonus.
- Transliteration is basic and intentionally marked with TODO for extension.
