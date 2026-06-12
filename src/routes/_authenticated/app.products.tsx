import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/products")({
  component: ProductsPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function ProductsPage() {
  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Products</p>
        <h1 className="font-display text-3xl mt-1">OTC product catalogue</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Pharmacy-curated catalogue of over-the-counter products, with active ingredients, cautions and pharmacist-reviewed indications.
        </p>
      </header>
      <Card className="p-10 text-center bg-card/60 backdrop-blur-sm">
        <Package className="h-8 w-8 mx-auto text-muted-foreground" />
        <div className="font-display text-lg mt-3">Ready — not yet populated</div>
        <div className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          The product table is provisioned. Curated entries will appear here once seeded; the recommendation engine already surfaces ingredient-based product discussions on case reviews.
        </div>
      </Card>
    </div>
  );
}
