import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runScreening } from "@/lib/screening/engine";

export async function POST(req: NextRequest) {
  const start = Date.now();

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch owned instrument IDs (MATCHED or PARTIAL orders)
  const { data: ownedOrders } = await supabase
    .from("orders")
    .select("ins_id")
    .eq("side", "BUY")
    .in("status", ["MATCHED", "PARTIAL"]);

  const ownedInsIds = new Set((ownedOrders ?? []).map((o: { ins_id: number }) => o.ins_id));

  const { candidates, all } = await runScreening(supabase, ownedInsIds);

  const screened_at = new Date().toISOString();

  const rows = all.map((r) => ({
    screened_at,
    ins_id: r.ins_id,
    passed: r.passed,
    failure_reason: r.failure_reason,
    is_owned: r.is_owned,
    last_close: r.last_close,
    spread_pct: r.spread_pct,
    avg_turnover_30d: r.avg_turnover_30d,
    trend_1m_pct: r.trend_1m_pct,
    trend_3m_pct: r.trend_3m_pct,
    support_level: r.support_level,
    support_touches: r.support_touches,
    resistance_level: r.resistance_level,
    resistance_touches: r.resistance_touches,
    range_width_pct: r.range_width_pct,
    position_in_range: r.position_in_range,
    score: r.score,
    suggested_buy_price: r.suggested_buy_price,
    suggested_sell_price: r.suggested_sell_price,
    suggested_qty: r.suggested_qty,
    suggested_position_sek: r.suggested_position_sek,
    rank: r.rank,
  }));

  // Batch insert (200 per call) to avoid payload limits
  const BATCH_SIZE = 200;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("screenings").insert(batch);
    if (error) throw new Error(`screenings insert batch ${i}: ${error.message}`);
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    total: all.length,
    failed: all.filter((r) => !r.passed).length,
    owned: all.filter((r) => r.is_owned).length,
    top3: candidates.slice(0, 3).map((c) => ({
      ins_id: c.ins_id,
      score: Math.round(c.score * 10) / 10,
      buy: c.suggested_buy_price,
      sell: c.suggested_sell_price,
    })),
    duration_ms: Date.now() - start,
  });
}
