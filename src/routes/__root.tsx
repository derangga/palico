import { TanStackDevtools } from "@tanstack/react-devtools";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Effect, Fiber, Option, Schema } from "effect";
import {
	Fragment,
	useEffect,
	useLayoutEffect,
	useReducer,
	useState,
} from "react";

import { AppSidebar } from "#/components/app-sidebar.tsx";
import { LanguageSwitcher } from "#/components/language-switcher.tsx";
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
import { useLocale } from "#/hooks/use-locale.ts";
import { resolveLocale } from "#/lib/i18n/locale.ts";
import { localeRuntime } from "#/lib/i18n/runtime.ts";
import { startOffline } from "#/lib/offline/register.ts";
import { offlineRuntime } from "#/lib/offline/runtime.ts";
import { CATEGORY_STYLES, TOOLS } from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

import appCss from "../styles.css?url";

// Every page can be opened with `?handoff=<id>` by "Send to..." (see
// docs/chain-tools.md). It is kept as a string here; the target page decodes it
// into a HandoffId, so a bad value still shows "Drop the file again".
const decodeHandoffParam = Schema.decodeUnknownOption(Schema.String);

interface RootSearch {
	readonly handoff?: string;
}

export const Route = createRootRoute({
	validateSearch: (search: RootSearch): RootSearch =>
		Option.match(decodeHandoffParam(search.handoff), {
			onNone: () => ({}),
			onSome: (handoff) => ({ handoff }),
		}),
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

// The top bar shows "Group / Tool" from the registry; the page h1 carries the
// full tool name, so the bar keeps the short one and does not repeat it.
interface Crumb {
	readonly group?: string;
	readonly title: string;
}

function crumbOf(pathname: string): Crumb {
	if (pathname === "/") return { title: m.sidebar_home() };

	const tool = TOOLS.find((t) => t.to === pathname);

	return tool
		? { group: CATEGORY_STYLES[tool.category].label, title: tool.crumb }
		: { title: "Palico" };
}

function RootLayout() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	// Subscribing here re-renders the header and sidebar on a language change.
	// The page content below is keyed on it, because `m.*()` calls are not reactive.
	const locale = useLocale();
	const crumb = crumbOf(pathname);
	const router = useRouter();

	// The store starts at English so the prerendered shell and hydration agree.
	// Switch to the saved or browser language before the first paint. The resolve is
	// synchronous (localStorage and navigator only). The store hook subscribes in a
	// passive effect, which can run after paint on hydration, so a state update here
	// forces the render that reads the new locale.
	const [, renderAgain] = useReducer((count: number) => count + 1, 0);

	useLayoutEffect(() => {
		localeRuntime.runSync(resolveLocale);
		renderAgain();
	}, []);

	// Page titles and descriptions come from each route's head(), which the router
	// only re-runs on navigation. Re-run them when the language changes.
	useEffect(() => {
		void router.invalidate();
	}, [locale, router]);

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
					<nav aria-label={m.breadcrumb_label()}>
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
						<LanguageSwitcher />
						<ThemeToggle />
					</div>
				</header>
				<div
					key={pathname}
					className={cn("flex-1", fadeIn && "animate-route-in")}
				>
					<Fragment key={locale}>
						<Outlet />
					</Fragment>
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
