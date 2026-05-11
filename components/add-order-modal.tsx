"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface Props {
  insId: number;
  ticker: string;
  suggestedBuy?: number;
  suggestedSell?: number;
  suggestedQty?: number;
}

export function AddOrderModal({ insId, ticker, suggestedBuy, suggestedSell, suggestedQty }: Props) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState(String(suggestedBuy ?? ""));
  const [qty, setQty] = useState(String(suggestedQty ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ins_id: insId,
        side,
        limit_price: price,
        qty,
      }),
    });

    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg ?? "Failed to create order");
      setSaving(false);
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  function handleSideChange(newSide: "BUY" | "SELL") {
    setSide(newSide);
    if (newSide === "BUY") {
      setPrice(String(suggestedBuy ?? ""));
      setQty(String(suggestedQty ?? ""));
    } else {
      setPrice(String(suggestedSell ?? ""));
      setQty(String(suggestedQty ?? ""));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add order</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New order — {ticker}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="flex gap-2">
            {(["BUY", "SELL"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSideChange(s)}
                className={`flex-1 py-1.5 text-sm rounded border transition-colors ${
                  side === s
                    ? s === "BUY"
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-red-600 text-white border-red-600"
                    : "border-border text-muted-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Limit price (SEK)</label>
            <input
              type="number"
              step="0.0001"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Quantity</label>
            <input
              type="number"
              min="1"
              required
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Total: {price && qty ? `${(parseFloat(price) * parseInt(qty, 10)).toLocaleString("sv-SE")} SEK` : "—"}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Place order"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
