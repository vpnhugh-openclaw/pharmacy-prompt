import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Pause, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";
import { getIngestionStatusFn, ingestShardFn, resetIngestionFn } from "@/lib/ingest.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/setup")({
  component: SetupPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function SetupPage() {
  const getStatus = useServerFn(getIngestionStatusFn);
  const ingest = useServerFn(ingestShardFn);
  const reset = useServerFn(resetIngestionFn);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const status = useQuery({ queryKey: ["ingestion-status"], queryFn: () => getStatus(), refetchInterval: running ? 1500 : false });
  const job = status.data?.jobs?.[0];

  const ingestMutation = useMutation({
    mutationFn: (jobId: string) => ingest({ data: { jobId } }),
    onError: (e: Error) => { toast.error(e.message); setRunning(false); runningRef.current = false; },
  });

  useEffect(() => {
    runningRef.current = running;
    if (!running || !job) return;
    let cancelled = false;
    (async () => {
      while (runningRef.current && !cancelled) {
        try {
          const r = await ingest({ data: { jobId: job.job_id } });
          await status.refetch();
          if (r.done) { setRunning(false); runningRef.current = false; toast.success("Knowledge base ingestion complete"); break; }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(msg); setRunning(false); runningRef.current = false; break;
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, job?.job_id]);

  const progress = job ? (job.shard_done / Math.max(job.shard_total, 1)) * 100 : 0;

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-10 space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Setup</p>
        <h1 className="font-display text-3xl mt-1">Knowledge base ingestion</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Loads the unified pharmaceutical knowledge base (Therapeutic Guidelines, Australian Medicines Handbook, drug interaction references, patient education materials) into the local search index. Runs in batches of 5,000 chunks per shard.
        </p>
      </header>

      <Card className="p-6 space-y-4 bg-card/60 backdrop-blur-sm">
        {status.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading status…</div>}
        {job && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display text-lg">{job.source_label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{job.shard_done} / {job.shard_total} shards · {status.data?.total_chunks?.toLocaleString() ?? 0} chunks indexed</div>
              </div>
              <StatusBadge status={running ? "running" : job.status} />
            </div>
            <Progress value={progress} className="h-2" />
            {job.last_error && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{job.last_error}</span>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {job.shard_done < job.shard_total ? (
                running ? (
                  <Button variant="outline" onClick={() => { setRunning(false); runningRef.current = false; }}>
                    <Pause className="h-4 w-4 mr-2" /> Pause
                  </Button>
                ) : (
                  <Button onClick={() => setRunning(true)} disabled={ingestMutation.isPending}>
                    <Play className="h-4 w-4 mr-2" /> {job.shard_done === 0 ? "Start ingestion" : "Resume"}
                  </Button>
                )
              ) : (
                <div className="flex items-center gap-2 text-sm text-foreground/80">
                  <CheckCircle2 className="h-4 w-4 text-foreground" /> All shards processed
                </div>
              )}
              <Button variant="ghost" onClick={async () => {
                if (!confirm("Clear all ingested chunks and reset progress?")) return;
                await reset({ data: { jobId: job.job_id } });
                await status.refetch();
                toast.success("Reset");
              }}>
                <RotateCcw className="h-4 w-4 mr-2" /> Reset
              </Button>
            </div>
          </>
        )}
      </Card>

      <div className="text-xs text-muted-foreground leading-relaxed border-t border-border/60 pt-4">
        Ingestion runs in your browser session — keep this tab open until it finishes. After completion, References search and source-attributed recommendations become available.
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ready: "bg-muted text-muted-foreground",
    running: "bg-accent/20 text-accent-foreground",
    complete: "bg-foreground text-background",
    error: "bg-destructive/15 text-destructive",
  };
  return <Badge className={`${map[status] ?? "bg-muted"} capitalize font-normal`}>{status}</Badge>;
}
