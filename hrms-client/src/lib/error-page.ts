export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en" data-theme="system" data-resolved-theme="light">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>
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
    </script>
    <style>
      :root {
        --background: oklch(0.99 0.005 285);
        --foreground: oklch(0.22 0.04 280);
        --card: oklch(1 0 0);
        --muted-foreground: oklch(0.52 0.03 280);
        --primary: oklch(0.46 0.21 290);
        --primary-foreground: oklch(0.99 0.005 285);
        --border: oklch(0.92 0.012 285);
      }
      .dark {
        --background: oklch(0.175 0.022 282);
        --foreground: oklch(0.93 0.012 285);
        --card: oklch(0.215 0.025 282);
        --muted-foreground: oklch(0.7 0.02 285);
        --primary: oklch(0.72 0.17 294);
        --primary-foreground: oklch(0.15 0.025 282);
        --border: oklch(1 0 0 / 0.085);
      }
      body {
        background:
          radial-gradient(circle at 20% 0%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 30rem),
          var(--background);
        color: var(--foreground);
        display: grid;
        min-height: 100vh;
        margin: 0;
        padding: 1.5rem;
        place-items: center;
        font: 15px/1.5 system-ui, -apple-system, sans-serif;
      }
      .card {
        width: 100%;
        max-width: 28rem;
        padding: 2rem;
        border: 1px solid var(--border);
        border-radius: 1rem;
        background: var(--card);
        text-align: center;
        box-shadow: 0 18px 50px -34px rgb(0 0 0 / 0.45);
      }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: var(--muted-foreground); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: var(--primary); color: var(--primary-foreground); }
      .secondary { background: var(--card); color: var(--foreground); border-color: var(--border); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
