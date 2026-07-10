import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, isInitializing, isCompanySetupComplete } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const appEnv = String(import.meta.env.VITE_APP_ENV ?? "").toLowerCase();
  const appVersion = String(import.meta.env.VITE_APP_VERSION ?? "");
  const buildSha = String(import.meta.env.VITE_BUILD_SHA ?? "");
  const showEnvironmentBanner = appEnv === "qa" || appEnv === "development";
  const environmentLabel = appEnv === "qa" ? "QA" : appEnv === "development" ? "Hosted dev" : "";
  const buildLabel = [appVersion, buildSha ? buildSha.slice(0, 7) : ""].filter(Boolean).join(" / ");

  useEffect(() => {
    if (isInitializing) return;
    if (user === null) {
      const t = setTimeout(() => {
        if (!user) navigate({ to: "/login" });
      }, 0);
      return () => clearTimeout(t);
    }
    if (!isCompanySetupComplete) {
      navigate({ to: "/onboarding" });
    }
  }, [user, navigate, isInitializing, isCompanySetupComplete]);

  if (!user || isInitializing || !isCompanySetupComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-label="Loading workspace"
          role="status"
        />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="bg-app flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar />
          {showEnvironmentBanner ? (
            <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning-foreground dark:text-warning">
              {environmentLabel} environment{buildLabel ? ` - ${buildLabel}` : ""}. Do not enter
              production data.
            </div>
          ) : null}
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div key={path} className="page-fade-in mx-auto w-full max-w-7xl space-y-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
