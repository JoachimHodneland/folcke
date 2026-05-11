import { NextRequest, NextResponse } from "next/server";
import { BorsdataClient } from "@/lib/borsdata/client";
import { createServiceClient } from "@/lib/supabase/server";

// Swedish market IDs from Börsdata: 4=First North, 5=Spotlight, 6=NGM (countryId=1)
const TARGET_MARKET_IDS = new Set([4, 5, 6]);

function isTargetMarket(market: { id: number; countryId: number }): boolean {
  return TARGET_MARKET_IDS.has(market.id) && market.countryId === 1;
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  // Verify cron secret
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.BORSDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "BORSDATA_API_KEY not configured" },
      { status: 500 }
    );
  }

  const borsdata = new BorsdataClient(apiKey);
  const supabase = createServiceClient();

  // 1. Markets
  const allMarkets = await borsdata.getMarkets();
  const targetMarkets = allMarkets.filter((m) => isTargetMarket(m));

  if (targetMarkets.length === 0) {
    return NextResponse.json(
      { error: "No target markets found – check market name matching" },
      { status: 500 }
    );
  }

  const { error: marketsError } = await supabase.from("markets").upsert(
    targetMarkets.map((m) => ({ id: m.id, name: m.name, active: true })),
    { onConflict: "id" }
  );
  if (marketsError) throw new Error(`markets upsert: ${marketsError.message}`);

  const targetMarketIds = new Set(targetMarkets.map((m) => m.id));

  // 2. Instruments
  const allInstruments = await borsdata.getInstruments();
  const targetInstruments = allInstruments.filter((i) =>
    targetMarketIds.has(i.marketId)
  );

  const { error: instrumentsError } = await supabase
    .from("instruments")
    .upsert(
      targetInstruments.map((i) => ({
        ins_id: i.insId,
        ticker: i.ticker,
        name: i.name,
        market_id: i.marketId,
        currency: "SEK",
      })),
      { onConflict: "ins_id" }
    );
  if (instrumentsError)
    throw new Error(`instruments upsert: ${instrumentsError.message}`);

  const targetInsIds = new Set(targetInstruments.map((i) => i.insId));

  // 3. Latest prices
  const allPrices = await borsdata.getLastPrices();
  const targetPrices = allPrices.filter((p) => targetInsIds.has(p.insId));

  const priceRows = targetPrices.map((p) => ({
    ins_id: p.insId,
    date: p.d,
    open: p.o,
    high: p.h,
    low: p.l,
    close: p.c,
    volume: p.v,
  }));

  const { error: pricesError } = await supabase
    .from("daily_prices")
    .upsert(priceRows, { onConflict: "ins_id,date" });
  if (pricesError) throw new Error(`prices upsert: ${pricesError.message}`);

  return NextResponse.json({
    ok: true,
    markets: targetMarkets.length,
    instruments: targetInstruments.length,
    prices: targetPrices.length,
    duration_ms: Date.now() - start,
  });
}
