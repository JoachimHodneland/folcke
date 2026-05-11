/**
 * One-time backfill: fetches 1 year of daily prices for every instrument
 * on Spotlight, First North Stockholm, and NGM Nordic SME.
 *
 * Run with:
 *   npx tsx scripts/backfill.ts
 *
 * Requires BORSDATA_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and
 * SUPABASE_SERVICE_ROLE_KEY to be set in .env.local (loaded below).
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { BorsdataClient } from "../lib/borsdata/client";

// Load .env.local from project root
config({ path: resolve(process.cwd(), ".env.local") });

// Swedish market IDs from Börsdata: 4=First North, 5=Spotlight, 6=NGM (countryId=1)
const TARGET_MARKET_IDS = new Set([4, 5, 6]);

function isTargetMarket(market: { id: number; countryId: number }): boolean {
  return TARGET_MARKET_IDS.has(market.id) && market.countryId === 1;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chunkUpsert(
  supabase: any,
  table: string,
  rows: Record<string, unknown>[],
  chunkSize = 500
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, {
      onConflict: table === "daily_prices" ? "ins_id,date" : "ins_id",
    });
    if (error) throw new Error(`Upsert into ${table}: ${error.message}`);
  }
}

async function main() {
  const apiKey = process.env.BORSDATA_API_KEY;
  if (!apiKey) throw new Error("BORSDATA_API_KEY is not set");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey)
    throw new Error("Supabase env vars not set");

  const borsdata = new BorsdataClient(apiKey);
  const supabase = createClient(supabaseUrl, serviceKey);

  const to = toDateString(new Date());
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 1);
  const from = toDateString(fromDate);

  console.log(`Backfilling ${from} → ${to}`);

  // 1. Markets
  const allMarkets = await borsdata.getMarkets();
  const targetMarkets = allMarkets.filter((m) => isTargetMarket(m));
  console.log(`Target markets: ${targetMarkets.map((m) => m.name).join(", ")}`);

  await supabase.from("markets").upsert(
    targetMarkets.map((m) => ({ id: m.id, name: m.name, active: true })),
    { onConflict: "id" }
  );

  const targetMarketIds = new Set(targetMarkets.map((m) => m.id));

  // 2. Instruments
  const allInstruments = await borsdata.getInstruments();
  const instruments = allInstruments.filter((i) =>
    targetMarketIds.has(i.marketId)
  );
  console.log(`Instruments to backfill: ${instruments.length}`);

  await supabase.from("instruments").upsert(
    instruments.map((i) => ({
      ins_id: i.insId,
      ticker: i.ticker,
      name: i.name,
      market_id: i.marketId,
      currency: "SEK",
    })),
    { onConflict: "ins_id" }
  );

  // 3. Historical prices – one instrument at a time
  let totalRows = 0;

  for (let idx = 0; idx < instruments.length; idx++) {
    const ins = instruments[idx];
    process.stdout.write(
      `[${idx + 1}/${instruments.length}] ${ins.ticker} (${ins.insId}) – `
    );

    try {
      const prices = await borsdata.getHistoricalPrices(ins.insId, from, to);

      if (prices.length === 0) {
        console.log("no data");
        continue;
      }

      const rows = prices.map((p) => ({
        ins_id: ins.insId,
        date: p.d,
        open: p.o,
        high: p.h,
        low: p.l,
        close: p.c,
        volume: p.v,
      }));

      await chunkUpsert(supabase, "daily_prices", rows);
      totalRows += rows.length;
      console.log(`${rows.length} rows`);
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. Total rows upserted: ${totalRows}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
