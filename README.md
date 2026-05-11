# Folcke Screener

Daily range-trading screener for Swedish microcap stocks (Spotlight, First North Stockholm, NGM Nordic SME).

**Dashboard:** https://folcke.vercel.app  
**Operations manual:** [docs/OPERATIONS.md](docs/OPERATIONS.md)

## Stack

- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres + Auth)
- Börsdata.se API (EOD prices)
- Vercel (hosting + cron jobs)

## Cron schedule (UTC)

| Job | Time | Days |
|-----|------|------|
| Ingest (`/api/cron/ingest`) | 20:30 | Mon–Fri |
| Screen (`/api/cron/screen`) | 21:00 | Mon–Fri |

## Local development

```bash
cp .env.example .env.local   # fill in keys
npm install
npm run dev
```

One-time backfill (1 year of historical prices):

```bash
npx tsx scripts/backfill.ts
```
