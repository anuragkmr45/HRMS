import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import { EmployeesProvider } from "@/lib/employees-store";
import { LeaveProvider } from "@/lib/leave-store";
import { ProjectsProvider } from "@/lib/projects-store";
import { TimesheetsProvider } from "@/lib/timesheets-store";
import { ExpensesProvider } from "@/lib/expenses-store";
import { AssetsProvider } from "@/lib/assets-store";
import { HelpdeskProvider } from "@/lib/helpdesk-store";
import { AdminSettingsProvider } from "@/lib/admin-settings-store";
import { ThemeProvider } from "@/lib/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import appCss from "../styles.css?url";

const themeInitScript = `
(function () {
  try {
    var key = "hawkaii-theme";
    var stored = localStorage.getItem(key);
    var preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;
    var root = document.documentElement;

    root.classList.toggle("dark", resolved === "dark");
    root.dataset.theme = preference;
    root.dataset.resolvedTheme = resolved;
    root.style.colorScheme = resolved;
  } catch (error) {
    document.documentElement.dataset.theme = "system";
  }
})();
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try refreshing or head home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hawkaii HRMS — Modern Workforce OS" },
      {
        name: "description",
        content:
          "Hawkaii HRMS is a premium HRMS and workforce operations platform built for modern software companies.",
      },
      { property: "og:title", content: "Hawkaii HRMS — Modern Workforce OS" },
      {
        property: "og:description",
        content:
          "Hawkaii HRMS is a premium HRMS and workforce operations platform built for modern software companies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Hawkaii HRMS — Modern Workforce OS" },
      {
        name: "twitter:description",
        content:
          "Hawkaii HRMS is a premium HRMS and workforce operations platform built for modern software companies.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <EmployeesProvider>
            <LeaveProvider>
              <ProjectsProvider>
                <TimesheetsProvider>
                  <ExpensesProvider>
                    <AssetsProvider>
                      <HelpdeskProvider>
                        <AdminSettingsProvider>
                          <TooltipProvider delayDuration={150}>
                            <Outlet />
                            <Toaster />
                          </TooltipProvider>
                        </AdminSettingsProvider>
                      </HelpdeskProvider>
                    </AssetsProvider>
                  </ExpensesProvider>
                </TimesheetsProvider>
              </ProjectsProvider>
            </LeaveProvider>
          </EmployeesProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
