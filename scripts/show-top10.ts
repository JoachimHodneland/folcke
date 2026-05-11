/**
 * Show latest screening results with ticker names.
 * Run with: npx tsx scripts/show-top10.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the latest screened_at timestamp
  const { data: latest } = await supabase
    .from("screenings")
    .select("screened_at")
    .order("screened_at", { ascending: false })
    .limit(1)
    .single();

  if (!latest) { console.log("No screenings found"); return; }
  const screened_at = latest.screened_at;
  console.log(`\nScreening run: ${screened_at}\n`);

  const { data: rows } = await supabase
    .from("screenings")
    .select("rank, ins_id, score, support_touches, resistance_touches, position_in_range, suggested_buy_price, suggested_sell_price, suggested_qty, suggested_position_sek")
    .eq("screened_at", screened_at)
    .order("rank", { ascending: true });

  if (!rows || rows.length === 0) { console.log("No candidates in latest run"); return; }

  // Fetch tickers
  const insIds = rows.map(r => r.ins_id);
  const { data: instruments } = await supabase
    .from("instruments")
    .select("ins_id, ticker")
    .in("ins_id", insIds);

  const tickerMap = new Map((instruments ?? []).map(i => [i.ins_id, i.ticker]));

  console.log("Rank  Ticker     Score   sup+res  PosInRange  Buy        Sell       Qty   PositionSEK");
  console.log("─────────────────────────────────────────────────────────────────────────────────────");
  for (const r of rows) {
    const ticker = tickerMap.get(r.ins_id) ?? `#${r.ins_id}`;
    const combined = r.support_touches + r.resistance_touches;
    console.log(
      `${String(r.rank).padStart(4)}  ${ticker.padEnd(10)} ${r.score.toFixed(1).padStart(6)}  ${String(combined).padStart(7)}  ${r.position_in_range?.toFixed(3).padStart(10) ?? "    N/A"}  ${r.suggested_buy_price.toFixed(4).padStart(9)}  ${r.suggested_sell_price.toFixed(4).padStart(9)}  ${String(r.suggested_qty).padStart(5)}  ${Math.round(r.suggested_position_sek).toLocaleString()}`
    );
  }
  console.log(`\nTotal candidates: ${rows.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
