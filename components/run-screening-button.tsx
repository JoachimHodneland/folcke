"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runScreeningAction } from "@/app/actions";
import { useRouter } from "next/navigation";

export function RunScreeningButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      try {
        const data = await runScreeningAction();
        setResult(`${data.candidates} candidates`);
        router.refresh();
      } catch (e) {
        setResult("Error: " + (e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button size="sm" variant="outline" onClick={handleClick} disabled={pending}>
        {pending ? "Running…" : "Run screening now"}
      </Button>
      {result && <span className="text-xs text-muted-foreground">{result}</span>}
    </div>
  );
}
