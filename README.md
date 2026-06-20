# Collect Digital

NFT project intelligence platform combining:
- NFTScore-style project evaluation
- Wikipedia-style community project history
- Floor/Rainbow-style wallet portfolio tracking

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui-style components
- Supabase (schema + migrations included)
- RainbowKit + Wagmi + Viem wallet auth
- OpenSea API service layer
- Stripe upgrade/payment flow
- Versioned scoring engine + admin Score Lab

## MVP coverage

### Phase 1 (implemented)
- Home page with collection search, trending, movers, top scores, and scoring methodology
- Collection page with score ring, subscores, explainability, market metrics, and OpenSea links
- Wallet dashboard with collector/flipper ratings, identity badges, portfolio valuation, and sell signals
- Upgrade funding page with campaign progress and Stripe checkout endpoint
- Claimed project dashboard scaffold (project teams can submit profile data)
- OpenSea integration service layer (live when API key is present, mock fallback otherwise)
- Configurable score engine with model/version abstraction
- Admin Score Lab with drag-and-drop category ordering and live simulation endpoint
- Background cron endpoint for snapshot refresh

### Phase 2+ (scaffolded data model)
- Wiki/history revisions
- Subscriptions and premium features
- Reputation, badges, and funded research contributions
- Formula versioning/backtesting storage primitives

## Project structure

- `src/app/` pages and API routes
- `src/lib/` services (`opensea`, `scoring`, `alerts`, `wallet`, `payments`)
- `supabase/migrations/` relational schema for all requested entities
- `src/components/admin/` Score Lab UI
- `src/components/wallet/` collector rating + share card

## Environment variables

Copy `.env.example` to `.env.local` and fill values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENSEA_API_KEY`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `CRON_SECRET`

## Commands

- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Trust guarantees

- Funding campaigns do not directly change scores.
- Claimed and upgraded statuses are explicitly labeled.
- Score confidence level is separate from score value.
- Formula assumptions are editable and versioned.
