import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DisclaimerFooter } from "@/components/disclaimer-footer";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center justify-between border-b border-hairline bg-background/70 backdrop-blur px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Pharmacy Recommendation Engine
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Deterministic mode · No AI · No retrieval
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
          <DisclaimerFooter />
        </div>
      </div>
    </SidebarProvider>
  );
}
