import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Package, Search } from "lucide-react";
import { listProductsFn } from "@/lib/cases.functions";

export const Route = createFileRoute("/_authenticated/app/products")({
  component: ProductsPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

type ProductRow = {
  product_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  active_ingredients: string[] | null;
  indications: string[] | null;
  cautions: string[] | null;
  pack_sizes: string[] | null;
  schedule: string | null;
  reviewed: boolean;
  clinical_use_tags: string[] | null;
  avoid_if_tags: string[] | null;
};

function asArr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function ProductsPage() {
  const fn = useServerFn(listProductsFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["products"],
    queryFn: () => fn(),
  });

  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const products = useMemo(() => (data ?? []) as ProductRow[], [data]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) for (const t of asArr(p.clinical_use_tags)) s.add(t);
    return Array.from(s).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (tagFilter && !asArr(p.clinical_use_tags).includes(tagFilter)) return false;
      if (!q) return true;
      const hay = [
        p.name,
        p.brand ?? "",
        p.category ?? "",
        ...asArr(p.active_ingredients),
        ...asArr(p.indications),
        ...asArr(p.clinical_use_tags),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, tagFilter]);

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Products</p>
        <h1 className="font-display text-3xl mt-1">OTC product catalogue</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Pharmacist-curated catalogue of over-the-counter products, with active ingredients,
          cautions and pharmacist-reviewed indications. Only{" "}
          <span className="font-medium text-foreground">reviewed</span> products are surfaced in
          patient case reviews.
        </p>
      </header>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, ingredient, or indication…"
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filtered.length} / {products.length} products
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTagFilter(null)}
            className={`pp-chip text-[11px] ${tagFilter === null ? "bg-foreground text-background border-foreground" : ""}`}
          >
            All tags
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(t === tagFilter ? null : t)}
              className={`pp-chip text-[11px] ${tagFilter === t ? "bg-foreground text-background border-foreground" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">Loading catalogue…</div>}
      {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}

      {!isLoading && products.length === 0 && (
        <Card className="p-10 text-center bg-card/60 backdrop-blur-sm">
          <Package className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-display text-lg mt-3">Catalogue not yet populated</div>
          <div className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Run the <span className="font-mono">seed_products_herbsofgold</span> migration to
            populate the catalogue from the Herbs of Gold Technical Manual.
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((p) => (
          <Card key={p.product_id} className="p-4 bg-card/60 backdrop-blur-sm space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display text-base leading-snug">{p.name}</h3>
                {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
              </div>
              {p.reviewed ? (
                <Badge className="text-[10px] bg-accent/15 text-accent border-accent/30">
                  Reviewed
                </Badge>
              ) : (
                <Badge className="text-[10px] bg-muted text-muted-foreground">Draft</Badge>
              )}
            </div>

            {asArr(p.active_ingredients).length > 0 && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {asArr(p.active_ingredients).slice(0, 3).join(" · ")}
              </p>
            )}

            {asArr(p.indications).length > 0 && (
              <p className="text-xs">
                <span className="uppercase tracking-wider text-muted-foreground text-[10px] mr-1">
                  For:
                </span>
                {asArr(p.indications).slice(0, 3).join(" · ")}
              </p>
            )}

            {asArr(p.clinical_use_tags).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {asArr(p.clinical_use_tags)
                  .slice(0, 6)
                  .map((t) => (
                    <span key={t} className="pp-chip text-[10px]">
                      {t}
                    </span>
                  ))}
                {asArr(p.clinical_use_tags).length > 6 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{asArr(p.clinical_use_tags).length - 6} more
                  </span>
                )}
              </div>
            )}

            {asArr(p.avoid_if_tags).length > 0 && (
              <p className="text-[10px] text-signal/80 line-clamp-2">
                <span className="uppercase tracking-wider mr-1">Avoid if:</span>
                {asArr(p.avoid_if_tags).slice(0, 4).join(" · ")}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
