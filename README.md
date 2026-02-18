# promo-list-bg

MVP project with **Next.js App Router + TypeScript + Tailwind + Prisma + PostgreSQL**.

Goal: keep a personal shopping list and compare current promotions from Lidl/Kaufland/Billa using external data from **DiscountHunter**.

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

## Environment

`.env.example`:

```bash
DATABASE_URL="postgresql://promo:promo@localhost:5432/promo_list_bg?schema=public"
DISCOUNT_HUNTER_API_BASE_URL="http://localhost:8888/api"
```

## Local Run (App)

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

5. Start Next.js app:

```bash
npm run dev
```

6. Open:

- `http://localhost:3000/my-list`
- `http://localhost:3000/deals`

## DiscountHunter API (Data Source)

This project now reads offers only from DiscountHunter endpoints (`/api/products/`).

Adapter file: `backend/src/lib/supermarketsApi.ts`

Implemented contract:

- `searchOffers(query: string, stores: Store[]): Promise<ExternalOffer[]>`
- `healthCheck(): Promise<boolean>`

Current adapter behavior:

- Reads base URL from `DISCOUNT_HUNTER_API_BASE_URL`.
- Requests `/products/` (with fallback path discovery).
- Uses `search`, `store`, `page` query params.
- Pulls **all pages** for each selected store.
- Maps API rows to internal offers.
- Returns empty array if API is unavailable.

Note: DiscountHunter list payload does not expose a dedicated currency field for each row. The adapter currently marks prices as `EUR` (TODO: optional FX conversion layer if needed).

## Running DiscountHunter Locally (Reference)

If you want a local data source:

1. Clone repo:

```bash
git clone https://github.com/Stoyan-Zlatev/DiscountHunter.git
```

2. Install API deps:

```bash
cd DiscountHunter/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Configure DB in `DiscountHunter/api/discountHunter/settings.py`.
4. Run migrations:

```bash
python manage.py migrate
```

5. Seed stores and scrape data:

```bash
python manage.py shell -c "from stores.models import Store; from discountHunter.cron import get_data; [Store.objects.get_or_create(name=n) for n in ['Billa','Lidl','Kaufland']]; get_data()"
```

6. Start API:

```bash
python manage.py runserver 8888
```

Then keep `DISCOUNT_HUNTER_API_BASE_URL="http://localhost:8888/api"` in this project.

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
