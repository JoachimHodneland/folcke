/**
 * Diagnose why BIOEX (ins_id=1933) is eliminated by the screening engine.
 * Run with: npx tsx scripts/diagnose-bioex.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { roundUpToTick, roundDownToTick } from "../lib/utils/ticks";

config({ path: resolve(process.cwd(), ".env.local") });

const INS_ID = parseInt(process.argv[2] ?? "1933", 10);

function checkRange(
  label: string,
  value: number,
  min: number | null,
  max: number | null
): boolean {
  const ok =
    (min === null || value >= min) && (max === null || value <= max);
  const arrow = ok ? "✓" : "✗ FAIL";
  const minStr = min !== null ? min.toString() : "-∞";
  const maxStr = max !== null ? max.toString() : "+∞";
  console.log(`  ${arrow}  ${label}: ${value.toFixed(4)}  [${minStr}, ${maxStr}]`);
  return ok;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch instrument info
  const { data: ins } = await supabase
    .from("instruments")
    .select("ins_id, ticker, name")
    .eq("ins_id", INS_ID)
    .single();
  console.log(`\nDiagnosing: ${ins?.ticker} (${ins?.name}) ins_id=${INS_ID}\n`);

  // Fetch last 180 days of prices
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data: prices } = await supabase
    .from("daily_prices")
    .select("ins_id, date, high, low, close, volume")
    .eq("ins_id", INS_ID)
    .gte("date", cutoffStr)
    .order("date", { ascending: false });

  if (!prices || prices.length === 0) {
    console.log("No price data found!");
    return;
  }

  console.log(`Price rows found: ${prices.length}`);
  if (prices.length < 30) {
    console.log("✗ FAIL  < 30 trading days of data");
    return;
  }

  const days90 = prices.slice(0, 90);
  const latest = days90[0];
  const last_close = latest.close;
  console.log(`Latest date: ${latest.date}, close: ${latest.close}\n`);

  console.log("── Stage A filters ──────────────────────────────────────────");

  // Price range
  const priceOk = checkRange("last_close", last_close, 0.5, 10);
  if (!priceOk) { console.log("\n→ ELIMINATED by: price range filter\n"); return; }

  // Avg spread over 30 days (not single-day to avoid spike disqualification)
  const days30 = days90.slice(0, 30);
  const spread_pct =
    days30.reduce((s, d) => s + ((d.high - d.low) / d.close) * 100, 0) / days30.length;
  console.log(`  (latest day spread: ${(((latest.high - latest.low) / latest.close) * 100).toFixed(1)}%)`);
  const spreadOk = checkRange("spread_pct (30d avg)", spread_pct, 2, 12);
  if (!spreadOk) { console.log("\n→ ELIMINATED by: spread filter\n"); return; }
  const avg_turnover_30d = days30.reduce((s, d) => s + d.close * d.volume, 0) / days30.length;
  const turnoverOk = checkRange("avg_turnover_30d", avg_turnover_30d, 100_000, 2_000_000);
  if (!turnoverOk) { console.log("\n→ ELIMINATED by: avg turnover filter\n"); return; }

  // Trends
  const close21d = prices[Math.min(21, prices.length - 1)].close;
  const close90d = prices[Math.min(89, prices.length - 1)].close;
  const trend_1m_pct = ((last_close - close21d) / close21d) * 100;
  const trend_3m_pct = ((last_close - close90d) / close90d) * 100;
  const trend1mOk = checkRange("trend_1m_pct", trend_1m_pct, -20, null);
  if (!trend1mOk) { console.log("\n→ ELIMINATED by: 1m trend filter\n"); return; }
  const trend3mOk = checkRange("trend_3m_pct", trend_3m_pct, -20, 25);
  if (!trend3mOk) { console.log("\n→ ELIMINATED by: 3m trend filter\n"); return; }

  console.log("\n── Stage B: support/resistance ──────────────────────────────");

  let support_level = 0;
  let support_touches = 0;
  for (let pct = 1; pct < 20; pct++) {
    const band_top = last_close * (1 - pct / 100);
    const band_bot = last_close * (1 - (pct + 1) / 100);
    const touches = days90.filter(d => d.low > band_bot && d.low <= band_top).length;
    if (touches >= 5 && touches > support_touches) {
      support_touches = touches;
      support_level = band_top;
    }
  }

  let resistance_level = 0;
  let resistance_touches = 0;
  for (let pct = 1; pct < 20; pct++) {
    const band_bot = last_close * (1 + pct / 100);
    const band_top = last_close * (1 + (pct + 1) / 100);
    const touches = days90.filter(d => d.high >= band_bot && d.high < band_top).length;
    if (touches >= 5 && touches > resistance_touches) {
      resistance_touches = touches;
      resistance_level = band_bot;
    }
  }

  console.log(`  support_level: ${support_level.toFixed(4)}, support_touches: ${support_touches}  (need ≥5)`);
  console.log(`  resistance_level: ${resistance_level.toFixed(4)}, resistance_touches: ${resistance_touches}  (need ≥5)`);
  console.log(`  combined_touches: ${support_touches + resistance_touches}  (need ≥12)`);

  if (support_level === 0) { console.log("\n→ ELIMINATED by: no support level with ≥5 touches\n"); return; }
  if (resistance_level === 0) { console.log("\n→ ELIMINATED by: no resistance level with ≥5 touches\n"); return; }
  if (support_touches + resistance_touches < 12) {
    console.log(`\n→ ELIMINATED by: combined touches ${support_touches + resistance_touches} < 12\n`);
    return;
  }

  const range_width_pct = ((resistance_level - support_level) / support_level) * 100;
  const rangeOk = checkRange("range_width_pct", range_width_pct, 5, null);
  if (!rangeOk) { console.log("\n→ ELIMINATED by: range width < 5%\n"); return; }

  const position_in_range = (last_close - support_level) / (resistance_level - support_level);
  const pirOk = checkRange("position_in_range", position_in_range, null, 0.70);
  if (!pirOk) { console.log("\n→ ELIMINATED by: position_in_range > 0.60\n"); return; }

  // Order suggestion
  const suggested_buy_price = roundUpToTick(support_level);
  const suggested_sell_price = roundDownToTick(resistance_level);
  if (suggested_sell_price <= suggested_buy_price) {
    console.log(`\n→ ELIMINATED by: tick rounding inverted range (buy=${suggested_buy_price}, sell=${suggested_sell_price})\n`);
    return;
  }

  console.log("\n✓ All filters passed – would be a candidate!");
}

main().catch(err => { console.error(err); process.exit(1); });
