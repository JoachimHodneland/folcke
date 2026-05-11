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

  const candidates = await runScreening(supabase);

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      candidates: 0,
      message: "No candidates passed filters today",
      duration_ms: Date.now() - start,
    });
  }

  const screened_at = new Date().toISOString();

  const rows = candidates.map((c) => ({
    screened_at,
    ins_id: c.ins_id,
    last_close: c.last_close,
    spread_pct: c.spread_pct,
    avg_turnover_30d: c.avg_turnover_30d,
    trend_1m_pct: c.trend_1m_pct,
    trend_3m_pct: c.trend_3m_pct,
    support_level: c.support_level,
    support_touches: c.support_touches,
    resistance_level: c.resistance_level,
    resistance_touches: c.resistance_touches,
    range_width_pct: c.range_width_pct,
    position_in_range: c.position_in_range,
    score: c.score,
    suggested_buy_price: c.suggested_buy_price,
    suggested_sell_price: c.suggested_sell_price,
    suggested_qty: c.suggested_qty,
    suggested_position_sek: c.suggested_position_sek,
    rank: c.rank,
  }));

  const { error } = await supabase.from("screenings").insert(rows);
  if (error) throw new Error(`screenings insert: ${error.message}`);

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    top3: candidates.slice(0, 3).map((c) => ({
      ins_id: c.ins_id,
      score: Math.round(c.score * 10) / 10,
      buy: c.suggested_buy_price,
      sell: c.suggested_sell_price,
    })),
    duration_ms: Date.now() - start,
  });
}
