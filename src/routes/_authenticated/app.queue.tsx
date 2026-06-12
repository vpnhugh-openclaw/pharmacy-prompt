import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/queue")({
  component: QueuePage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function QueuePage() {
  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Queue</p>
        <h1 className="font-display text-3xl mt-1">Needs pharmacist review</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Cases flagged by the engine as needing direct pharmacist review — escalations, low-confidence recommendations, and conservative cautions.
        </p>
      </header>
      <Card className="p-10 text-center bg-card/60 backdrop-blur-sm">
        <Inbox className="h-8 w-8 mx-auto text-muted-foreground" />
        <div className="font-display text-lg mt-3">Empty</div>
        <div className="text-sm text-muted-foreground mt-1">Reviews that surface a "Pharmacist must verify" recommendation will appear here in Phase 5.</div>
      </Card>
    </div>
  );
}
