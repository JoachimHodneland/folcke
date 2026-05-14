"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  function handleCancel() {
    startTransition(async () => {
      setError("");
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: orderId,
          status: "CANCELLED",
          closed_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        setError(msg ?? "Failed");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-xs px-2 text-destructive hover:text-destructive"
        disabled={pending}
        onClick={handleCancel}
      >
        {pending ? "..." : "Cancel"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

interface MarkSoldProps {
  buyOrderId: string;
  insId: number;
  qtyFilled: number;
  avgFillPrice: number;
}

export function MarkSoldButton({ buyOrderId, insId, qtyFilled, avgFillPrice }: MarkSoldProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  function handleMarkSold() {
    startTransition(async () => {
      setError("");
      // Create a SELL MATCHED order to close the position
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ins_id: insId,
          side: "SELL",
          limit_price: String(avgFillPrice),
          qty: String(qtyFilled),
          pair_id: buyOrderId,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        setError(msg ?? "Failed");
        return;
      }
      const sellOrder = await res.json();
      // Now mark the sell order as fully filled/SOLD
      const res2 = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sellOrder.id,
          status: "SOLD",
          qty_filled: qtyFilled,
          avg_fill_price: avgFillPrice,
          matched_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
        }),
      });
      if (!res2.ok) {
        const { error: msg } = await res2.json();
        setError(msg ?? "Failed");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-xs px-2 text-red-600 hover:text-red-600"
        disabled={pending}
        onClick={handleMarkSold}
      >
        {pending ? "..." : "Mark sold"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
