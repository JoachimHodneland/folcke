"use server";

import { revalidatePath } from "next/cache";

export async function runScreeningAction() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(
    `${baseUrl}/api/cron/screen`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Screening failed: ${body}`);
  }

  revalidatePath("/");
  return res.json();
}
