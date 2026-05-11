"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Status = "PLACED" | "MATCHED" | "SOLD" | "CANCELLED";

interface Props {
  orderId: string;
  currentStatus: Status;
}

export function OrderActions({ orderId, currentStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  async function updateStatus(newStatus: Status) {
    startTransition(async () => {
      setError("");
      const supabase = createClient();
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === "MATCHED") updates.matched_at = new Date().toISOString();
      if (newStatus === "SOLD" || newStatus === "CANCELLED") updates.closed_at = new Date().toISOString();

      const { error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", orderId);

      if (error) setError(error.message);
      else router.refresh();
    });
  }

  return (
    <div className="flex gap-1 items-center flex-wrap">
      {currentStatus === "PLACED" && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs px-2"
          disabled={pending}
          onClick={() => updateStatus("MATCHED")}
        >
          Matched
        </Button>
      )}
      {currentStatus === "MATCHED" && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs px-2"
          disabled={pending}
          onClick={() => updateStatus("SOLD")}
        >
          Sold
        </Button>
      )}
      {(currentStatus === "PLACED" || currentStatus === "MATCHED") && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs px-2 text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => updateStatus("CANCELLED")}
        >
          Cancel
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
