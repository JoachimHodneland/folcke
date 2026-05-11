"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@/lib/types";

interface Props {
  orderId: string;
  currentStatus: OrderStatus;
  side: string;
  qty: number;
  qtyFilled: number;
  avgFillPrice: number | null;
  pairId: string | null;
  insId: number;
  suggestedSellPrice: number | null;
}

export function OrderActions({
  orderId,
  currentStatus,
  side,
  qty,
  qtyFilled,
  avgFillPrice,
  pairId,
  insId,
  suggestedSellPrice,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  async function updateOrder(updates: Record<string, unknown>) {
    const res = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, ...updates }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      throw new Error(msg ?? "Update failed");
    }
  }

  async function createSellOrder() {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ins_id: insId,
        side: "SELL",
        limit_price: String(suggestedSellPrice),
        qty: String(qtyFilled),
        pair_id: orderId,
      }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      throw new Error(msg ?? "Failed to create sell order");
    }
  }

  function handleCancel() {
    startTransition(async () => {
      setError("");
      try {
        await updateOrder({ status: "CANCELLED", closed_at: new Date().toISOString() });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });
  }

  function handleCreateSell() {
    startTransition(async () => {
      setError("");
      try {
        await createSellOrder();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });
  }

  const canFill = currentStatus === "PLACED" || currentStatus === "PARTIAL";
  const canSell = side === "BUY" && (currentStatus === "PARTIAL" || currentStatus === "MATCHED") && qtyFilled > 0;
  const canCancel = currentStatus === "PLACED" || currentStatus === "PARTIAL" || currentStatus === "MATCHED";

  return (
    <div className="flex gap-1 items-center flex-wrap">
      {canFill && (
        <FillButton
          orderId={orderId}
          side={side}
          qty={qty}
          qtyFilled={qtyFilled}
          avgFillPrice={avgFillPrice}
          pairId={pairId}
          pending={pending}
        />
      )}
      {canSell && suggestedSellPrice && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs px-2 text-blue-600 hover:text-blue-600"
          disabled={pending}
          onClick={handleCreateSell}
        >
          Salgsordre
        </Button>
      )}
      {canCancel && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs px-2 text-destructive hover:text-destructive"
          disabled={pending}
          onClick={handleCancel}
        >
          Cancel
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

// Inline FillButton that opens the FillDialog
import { FillDialog } from "@/components/fill-dialog";

function FillButton({
  orderId,
  side,
  qty,
  qtyFilled,
  avgFillPrice,
  pairId,
  pending,
}: {
  orderId: string;
  side: string;
  qty: number;
  qtyFilled: number;
  avgFillPrice: number | null;
  pairId: string | null;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-xs px-2"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        Fylt
      </Button>
      <FillDialog
        open={open}
        onOpenChange={setOpen}
        orderId={orderId}
        side={side as "BUY" | "SELL"}
        qty={qty}
        qtyFilled={qtyFilled}
        avgFillPrice={avgFillPrice}
        pairId={pairId}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
