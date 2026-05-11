import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { ins_id, side, limit_price, qty, pair_id } = body;

  if (!ins_id || !side || !limit_price || !qty) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["BUY", "SELL"].includes(side)) {
    return NextResponse.json({ error: "Invalid side" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc.from("orders").insert({
    ins_id,
    side,
    limit_price: parseFloat(limit_price),
    qty: parseInt(qty, 10),
    status: "PLACED",
    placed_at: new Date().toISOString(),
    ...(pair_id ? { pair_id } : {}),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  const svc = createServiceClient();

  // If this is a SELL fill, compute PnL from paired BUY order
  if (updates.qty_filled != null && updates.avg_fill_price != null) {
    // Fetch the current order to check if it's a SELL with pair_id
    const { data: order } = await svc.from("orders").select("side, pair_id").eq("id", id).single();

    if (order?.side === "SELL" && order.pair_id) {
      const { data: buyOrder } = await svc
        .from("orders")
        .select("avg_fill_price")
        .eq("id", order.pair_id)
        .single();

      if (buyOrder?.avg_fill_price != null) {
        updates.pnl_sek = updates.qty_filled * (updates.avg_fill_price - buyOrder.avg_fill_price);
      }
    }
  }

  const { data, error } = await svc
    .from("orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
