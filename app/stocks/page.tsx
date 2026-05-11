import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function StocksPage() {
  const supabase = await createClient();

  const { data: instruments } = await supabase
    .from("instruments")
    .select("ins_id, ticker, name, market_id")
    .order("ticker", { ascending: true });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">All stocks</h1>
      <div className="overflow-x-auto rounded-md border">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Market</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(instruments ?? []).map((i) => (
              <TableRow key={i.ins_id}>
                <TableCell className="font-medium">
                  <Link href={`/stocks/${encodeURIComponent(i.ticker)}`} className="hover:underline">
                    {i.ticker}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{i.name}</TableCell>
                <TableCell>{i.market_id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
