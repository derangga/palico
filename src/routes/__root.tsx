import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { AppSidebar } from "#/components/app-sidebar.tsx";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "#/components/ui/sidebar.tsx";
import { Toaster } from "#/components/ui/sonner.tsx";

import appCss from "../styles.css?url";

const SITE_TITLE = "Palico — Offline image tools";
const SITE_DESCRIPTION =
  "Palico is a free, offline-first toolkit for converting and resizing images. Everything runs in your browser — no uploads, no tracking, no data collected.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
});

const PAGE_TITLES: Record<string, string> = {
  "/": "Home",
  "/converter": "Image Converter",
  "/resizer": "Image Resizer",
  "/background-removal": "Remove Background",
  "/favicon-generator": "Favicon Generator",
  "/video-converter": "Video Converter",
};

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pageTitle = PAGE_TITLES[pathname] ?? "Palico";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background/70 px-4 backdrop-blur-md supports-backdrop-filter:bg-background/60">
          <SidebarTrigger />
          <span className="text-sm font-semibold">{pageTitle}</span>
        </header>
        <div className="flex-1">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster />
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
