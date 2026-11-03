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
import { useEffect, useRef, useState } from "react";

import { AppSidebar } from "#/components/app-sidebar.tsx";
import { UpdatePrompt } from "#/components/offline/update-prompt.tsx";
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

const SITE_TITLE = "Palico: Free, private, offline file tools. No sign-up.";
const SITE_DESCRIPTION =
	"Palico is a free, offline-first toolkit for images, video, PDFs, and files: convert, resize, remove backgrounds, split PDFs, and more. Everything runs entirely in your browser: no uploads, no tracking, no account required. Your files never leave your device.";

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
			{ property: "og:image", content: "/og-image.png" },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:image", content: "/og-image.png" },
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
const PAGE_CRUMBS: Record<string, { group?: string; title: string }> = {
	"/": { title: "Home" },
	"/converter": { group: "Image", title: "Converter" },
	"/resizer": { group: "Image", title: "Resizer" },
	"/compressor": { group: "Image", title: "Compress" },
	"/background-removal": { group: "Image", title: "Remove Background" },
	"/favicon-generator": { group: "Image", title: "Favicon Generator" },
	"/video-converter": { group: "Video", title: "Converter" },
	"/video-cutter": { group: "Video", title: "Cutter" },
	"/video-compressor": { group: "Video", title: "Compress" },
	"/video-to-gif": { group: "Video", title: "To GIF" },
	"/extract-audio": { group: "Video", title: "Extract Audio" },
	"/markdown-preview": { group: "File", title: "Markdown Preview" },
	"/diff-viewer": { group: "File", title: "Diff Viewer" },
	"/pdf-split": { group: "File", title: "Split PDF" },
	"/pdf-merge": { group: "File", title: "Merge PDFs" },
	"/pdf-organize": { group: "File", title: "Organize PDF" },
	"/pdf-to-images": { group: "File", title: "PDF to Images" },
	"/office-to-pdf": { group: "File", title: "Word to PDF" },
};

function RootLayout() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const crumb = PAGE_CRUMBS[pathname] ?? { title: "Palico" };

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
	const keyboardDriven = useRef(false);
	useEffect(() => {
		const onKey = () => {
			keyboardDriven.current = true;
		};
		const onPointer = () => {
			keyboardDriven.current = false;
		};
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("pointerdown", onPointer, true);
		return () => {
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("pointerdown", onPointer, true);
		};
	}, []);
	const [lastPath, setLastPath] = useState(pathname);
	const [fadeIn, setFadeIn] = useState(false);
	if (lastPath !== pathname) {
		setLastPath(pathname);
		setFadeIn(!keyboardDriven.current);
	}

	return (
		<SidebarProvider>
			<UpdatePrompt />
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
					<ThemeToggle />
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
