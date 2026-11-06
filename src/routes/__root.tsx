import { TanStackDevtools } from "@tanstack/react-devtools";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Effect, Fiber } from "effect";
import { useEffect, useState } from "react";

import { AppSidebar } from "#/components/app-sidebar.tsx";
import { UpdatePrompt } from "#/components/offline/update-prompt.tsx";
import { SearchButton } from "#/components/search/search-button.tsx";
import { SearchPalette } from "#/components/search/search-palette.tsx";
import { ThemeProvider } from "#/components/theme-provider.tsx";
import { ThemeToggle } from "#/components/theme-toggle.tsx";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar.tsx";
import { Toaster } from "#/components/ui/sonner.tsx";
import { startOffline } from "#/lib/offline/register.ts";
import { offlineRuntime } from "#/lib/offline/runtime.ts";
import { cn } from "#/lib/utils.ts";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	// Title, description and social tags come from each route (src/lib/seo.ts):
	// a root head runs once and is not re-run when the URL changes.
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.ico", sizes: "any" },
			{
				rel: "icon",
				type: "image/png",
				sizes: "16x16",
				href: "/favicon-16.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				href: "/favicon-32.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "180x180",
				href: "/apple-touch-icon.png",
			},
			{ rel: "manifest", href: "/site.webmanifest" },
		],
	}),
	component: RootLayout,
	shellComponent: RootDocument,
});

// Group matches the sidebar sections in app-sidebar.tsx; the page h1 carries the
// full tool name, so the top bar only shows "Group / Tool" to avoid repeating it.
const PAGE_CRUMBS = new Map<
	string,
	{ readonly group?: string; readonly title: string }
>([
	["/", { title: "Home" }],
	["/converter", { group: "Image", title: "Converter" }],
	["/resizer", { group: "Image", title: "Resizer" }],
	["/compressor", { group: "Image", title: "Compress" }],
	["/background-removal", { group: "Image", title: "Remove Background" }],
	["/favicon-generator", { group: "Image", title: "Favicon Generator" }],
	["/video-converter", { group: "Video & Audio", title: "Converter" }],
	["/video-cutter", { group: "Video & Audio", title: "Cutter" }],
	["/video-compressor", { group: "Video & Audio", title: "Compress" }],
	["/video-to-gif", { group: "Video & Audio", title: "To GIF" }],
	["/extract-audio", { group: "Video & Audio", title: "Extract Audio" }],
	["/audio-cutter", { group: "Video & Audio", title: "Audio Cutter" }],
	["/markdown-preview", { group: "Developer", title: "Markdown Preview" }],
	["/diff-viewer", { group: "Developer", title: "Diff Viewer" }],
	["/pdf-split", { group: "File", title: "Split PDF" }],
	["/pdf-merge", { group: "File", title: "Merge PDFs" }],
	["/pdf-organize", { group: "File", title: "Organize PDF" }],
	["/pdf-to-images", { group: "File", title: "PDF to Images" }],
	["/office-to-pdf", { group: "File", title: "Word to PDF" }],
	["/qr-generator", { group: "File", title: "QR Generator" }],
	["/qr-reader", { group: "File", title: "QR Reader" }],
	["/palette-extractor", { group: "Color", title: "Palette Extractor" }],
	["/color-picker", { group: "Color", title: "Color Picker" }],
	["/cron-generator", { group: "Developer", title: "Cron Generator" }],
]);

function RootLayout() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const crumb = PAGE_CRUMBS.get(pathname) ?? { title: "Palico" };

	// Production only: the worker would cache stale modules during `vite dev`.
	useEffect(() => {
		if (!import.meta.env.PROD) return;
		const fiber = offlineRuntime.runFork(startOffline);

		return () => {
			Effect.runFork(Fiber.interrupt(fiber));
		};
	}, []);

	// Fade the page in after a pointer-driven navigation only: not on first load,
	// not for keyboard navigation (the last input before the route change).
	// State, not a ref: it is read during render below. Setting the same value
	// again is a no-op, so only a switch between keyboard and pointer re-renders.
	const [keyboardDriven, setKeyboardDriven] = useState(false);
	useEffect(() => {
		const onKey = () => setKeyboardDriven(true);
		const onPointer = () => setKeyboardDriven(false);

		window.addEventListener("keydown", onKey, true);
		window.addEventListener("pointerdown", onPointer, true);

		return () => {
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("pointerdown", onPointer, true);
		};
	}, []);
	const [searchOpen, setSearchOpen] = useState(false);
	const [lastPath, setLastPath] = useState(pathname);
	const [fadeIn, setFadeIn] = useState(false);

	if (lastPath !== pathname) {
		setLastPath(pathname);
		setFadeIn(!keyboardDriven);
	}

	return (
		<SidebarProvider>
			<UpdatePrompt />
			<SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
			<AppSidebar />
			<SidebarInset>
				<header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background/70 px-4 backdrop-blur-md supports-backdrop-filter:bg-background/60">
					<SidebarTrigger />
					<nav aria-label="Breadcrumb">
						<ol className="flex items-center gap-1.5 text-sm">
							{crumb.group && (
								<>
									<li className="text-muted-foreground">{crumb.group}</li>
									<li aria-hidden className="text-muted-foreground">
										/
									</li>
								</>
							)}
							<li aria-current="page" className="font-semibold">
								{crumb.title}
							</li>
						</ol>
					</nav>
					<div className="ml-auto flex items-center gap-2">
						<SearchButton onClick={() => setSearchOpen(true)} />
						<ThemeToggle />
					</div>
				</header>
				<div
					key={pathname}
					className={cn("flex-1", fadeIn && "animate-route-in")}
				>
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
				{/* Rendered here, not in head(): the router dedupes meta by name. */}
				<meta
					name="theme-color"
					content="#eff1f5"
					media="(prefers-color-scheme: light)"
				/>
				<meta
					name="theme-color"
					content="#1e1e2e"
					media="(prefers-color-scheme: dark)"
				/>
			</head>
			<body>
				<ThemeProvider>
					{children}
					<Toaster />
				</ThemeProvider>
				{import.meta.env.DEV && (
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
				)}
				<Scripts />
			</body>
		</html>
	);
}
