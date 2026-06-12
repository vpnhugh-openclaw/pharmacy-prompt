import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink, Loader2 } from "lucide-react";
import { searchKbFn } from "@/lib/ingest.functions";

export const Route = createFileRoute("/_authenticated/app/references")({
  component: ReferencesPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

const SOURCE_LABEL: Record<string, string> = {
  TG: "Therapeutic Guidelines",
  AMH: "Australian Medicines Handbook",
  CMI: "Consumer Medicines Information",
  PI: "Product Information",
};

function ReferencesPage() {
  const search = useServerFn(searchKbFn);
  const [q, setQ] = useState("");
  const mut = useMutation({
    mutationFn: (query: string) => search({ data: { query, limit: 25 } }),
  });

  function go(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) mut.mutate(q.trim());
  }

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">References</p>
        <h1 className="font-display text-3xl mt-1">Clinical knowledge search</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Search ingested clinical sources — Therapeutic Guidelines, AMH, product information. Results are ranked by source tier. Read the source, then apply judgement.
        </p>
      </header>

      <form onSubmit={go} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. metformin renal dose, warfarin bleeding, statin myopathy" className="pl-9 h-11" />
        </div>
        <Button type="submit" disabled={mut.isPending} className="h-11 px-6">
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </form>

      {mut.isError && <div className="text-sm text-destructive">{(mut.error as Error).message}</div>}

      {mut.data && mut.data.results.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No matches. Confirm the knowledge base has been ingested in <span className="font-medium">Set-up</span>.
        </Card>
      )}

      <div className="space-y-3">
        {mut.data?.results.map((r) => (
          <Card key={r.chunk_id} className="p-5 bg-card/60 backdrop-blur-sm hover:bg-card transition">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="space-y-1 min-w-0">
                <div className="font-display text-base leading-snug truncate">{r.title || r.section_heading || "Untitled"}</div>
                {r.section_heading && r.title && r.section_heading !== "(body)" && (
                  <div className="text-xs text-muted-foreground truncate">{r.section_heading}</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  Tier {r.source_tier} · {SOURCE_LABEL[r.source] ?? r.source}
                </Badge>
                {r.source_url && (
                  <a href={r.source_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-line line-clamp-6">{r.text}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
