"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface FillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  side: "BUY" | "SELL";
  qty: number;
  qtyFilled: number;
  avgFillPrice: number | null;
  pairId: string | null;
  onSuccess: () => void;
}

export function FillDialog({
  open,
  onOpenChange,
  orderId,
  side,
  qty,
  qtyFilled,
  avgFillPrice,
  onSuccess,
}: FillDialogProps) {
  const remaining = qty - qtyFilled;
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [fillQty, setFillQty] = useState("");
  const [fillPrice, setFillPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setMode("full");
    setFillQty("");
    setFillPrice("");
    setError("");
    setSaving(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const isFullFill = mode === "full";
    const newFillQty = isFullFill ? remaining : parseInt(fillQty, 10);
    const newFillPrice = isFullFill ? (avgFillPrice ?? 0) : parseFloat(fillPrice);

    if (!isFullFill && (isNaN(newFillQty) || newFillQty <= 0)) {
      setError("Ugyldig antall");
      setSaving(false);
      return;
    }
    if (!isFullFill && (isNaN(newFillPrice) || newFillPrice <= 0)) {
      setError("Ugyldig pris");
      setSaving(false);
      return;
    }
    if (isFullFill && !avgFillPrice) {
      // First fill can't use "full" without a price — need partial mode
      setError("Ingen tidligere fyllpris — bruk delvis fyll med pris");
      setSaving(false);
      return;
    }

    // Compute weighted average fill price
    const oldQty = qtyFilled;
    const oldAvg = avgFillPrice ?? 0;
    const totalQtyFilled = oldQty + newFillQty;
    const newAvg = oldQty > 0
      ? (oldQty * oldAvg + newFillQty * newFillPrice) / totalQtyFilled
      : newFillPrice;

    const fullyFilled = totalQtyFilled >= qty;

    // Determine new status
    let newStatus: string;
    if (!fullyFilled) {
      newStatus = "PARTIAL";
    } else if (side === "BUY") {
      newStatus = "MATCHED";
    } else {
      newStatus = "SOLD";
    }

    const updates: Record<string, unknown> = {
      qty_filled: totalQtyFilled,
      avg_fill_price: newAvg,
      last_fill_at: new Date().toISOString(),
      status: newStatus,
    };

    if (newStatus === "MATCHED") {
      updates.matched_at = new Date().toISOString();
    }
    if (newStatus === "SOLD") {
      updates.closed_at = new Date().toISOString();
    }

    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, ...updates }),
      });

      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Update failed");
      }

      reset();
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  // For first fill on a PLACED order, force partial mode (need price input)
  const isFirstFill = qtyFilled === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrer fyll</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="text-xs space-y-1">
            <p>Total qty: <span className="font-mono font-medium">{qty.toLocaleString("sv-SE")}</span></p>
            {qtyFilled > 0 && (
              <p>Allerede fylt: <span className="font-mono font-medium">{qtyFilled.toLocaleString("sv-SE")}</span> ({Math.round((qtyFilled / qty) * 100)}%)</p>
            )}
            <p>Gjenstår: <span className="font-mono font-medium">{remaining.toLocaleString("sv-SE")}</span></p>
          </div>

          {!isFirstFill && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("full")}
                className={`flex-1 py-1.5 text-sm rounded border transition-colors ${
                  mode === "full"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                Hele resten fylt
              </button>
              <button
                type="button"
                onClick={() => setMode("partial")}
                className={`flex-1 py-1.5 text-sm rounded border transition-colors ${
                  mode === "partial"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                Delvis fyll
              </button>
            </div>
          )}

          {(mode === "partial" || isFirstFill) && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium">Nye stk fylt</label>
                <input
                  type="number"
                  min="1"
                  max={remaining}
                  required
                  value={fillQty}
                  onChange={(e) => setFillQty(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Pris på dette fyllet</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={fillPrice}
                  onChange={(e) => setFillPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </>
          )}

          {mode === "full" && !isFirstFill && (
            <p className="text-xs text-muted-foreground">
              Fyller gjenstående {remaining.toLocaleString("sv-SE")} stk til snitt {avgFillPrice?.toFixed(4)} SEK
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Lagrer…" : "Registrer fyll"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
