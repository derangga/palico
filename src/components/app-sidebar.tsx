import { Link, useRouterState } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

import {
	OFFLINE_DOT,
	offlineLabel,
} from "#/components/offline/offline-pill.tsx";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "#/components/ui/sidebar.tsx";
import { useOfflineStatus } from "#/hooks/use-offline-status.ts";
import {
	CATEGORY_STYLES,
	type Tool,
	toolGroups,
} from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";

const homeItem = { to: "/", label: "Home", icon: Home } as const;

type NavItem = Pick<Tool, "to" | "label" | "icon"> &
	Partial<Pick<Tool, "category" | "engine">>;

function SidebarNavItem({
	item,
	pathname,
}: {
	item: NavItem;
	pathname: string;
}) {
	const { isMobile, setOpenMobile } = useSidebar();
	const offline = useOfflineStatus("engine" in item ? item.engine : undefined);
	const isActive =
		item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				isActive={isActive}
				tooltip={item.label}
				// Once the sliding pill is placed it draws the active background.
				className="group-data-[pill=ready]/nav:data-active:bg-transparent"
				// On mobile the sidebar is a sheet: close it once a destination is chosen.
				onClick={() => {
					if (isMobile) setOpenMobile(false);
				}}
				render={<Link to={item.to} />}
			>
				<item.icon
					className={item.category && CATEGORY_STYLES[item.category].ink}
				/>
				<span>{item.label}</span>
				{offline &&
					offline._tag !== "Unavailable" &&
					"engine" in item &&
					item.engine && (
						<span
							role="img"
							aria-label={offlineLabel(offline)}
							title={offlineLabel(offline)}
							className={cn(
								"ml-auto size-1.5 shrink-0 rounded-full group-data-[collapsible=icon]:hidden",
								OFFLINE_DOT[offline._tag],
							)}
						/>
					)}
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

/**
 * One background pill that slides to the active item (transform and opacity
 * only). It follows the route, not keyboard focus, so arrow-key movement stays
 * instant. Reduced motion: the global rule drops the transform transition, so
 * the pill just appears in place.
 */
function ActivePill({
	pathname,
	children,
}: {
	pathname: string;
	children: ReactNode;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const pillRef = useRef<HTMLSpanElement>(null);
	const placed = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger to re-place the pill
	useEffect(() => {
		const root = rootRef.current;
		const pill = pillRef.current;
		if (!root || !pill) return;

		const place = (animate: boolean) => {
			const active = root.querySelector<HTMLElement>(
				'[data-slot="sidebar-menu-button"][data-active]',
			);
			if (!active) {
				pill.style.opacity = "0";
				return;
			}
			const rootTop = root.getBoundingClientRect().top;
			const box = active.getBoundingClientRect();
			// Resizes (sidebar collapse, mobile item height) snap instead of sliding.
			pill.style.transition = animate ? "" : "none";
			pill.style.height = `${box.height}px`;
			pill.style.transform = `translateY(${box.top - rootTop}px)`;
			pill.style.opacity = "1";
			root.dataset.pill = "ready";
		};

		place(placed.current);
		placed.current = true;
		// The observer fires once on observe(); skip that so the slide survives.
		let initial = true;
		const observer = new ResizeObserver(() => {
			if (initial) {
				initial = false;
				return;
			}
			place(false);
		});
		observer.observe(root);
		return () => observer.disconnect();
	}, [pathname]);

	return (
		<div
			ref={rootRef}
			className="group/nav relative isolate flex flex-col gap-2"
		>
			<span
				ref={pillRef}
				aria-hidden
				className="pointer-events-none absolute inset-x-2 top-0 -z-10 rounded-md bg-sidebar-accent opacity-0 transition-[transform,opacity] duration-200 ease-drawer"
			/>
			{children}
		</div>
	);
}

export function AppSidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<Sidebar variant="sidebar" collapsible="icon">
			<SidebarHeader>
				<div className="group/logo flex items-center gap-2 px-1 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
					<img
						src="/palico-face.webp"
						width={32}
						height={32}
						alt="Palico"
						className="size-8 max-w-none shrink-0 rounded-lg object-cover transition-transform duration-200 ease-out group-hover/logo:rotate-6 motion-reduce:group-hover/logo:rotate-0"
					/>
					<div
						aria-hidden
						className="grid flex-1 leading-tight group-data-[collapsible=icon]:hidden"
					>
						<span className="text-base font-bold">Palico</span>
						<span className="text-muted-foreground text-xs">
							Client first tools
						</span>
					</div>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<ActivePill pathname={pathname}>
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarMenu>
								<SidebarNavItem item={homeItem} pathname={pathname} />
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
					{toolGroups.map((group) => (
						<SidebarGroup key={group.id}>
							<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{group.tools.map((tool) => (
										<SidebarNavItem
											key={tool.to}
											item={tool}
											pathname={pathname}
										/>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					))}
				</ActivePill>
			</SidebarContent>
			<SidebarFooter>
				<p className="text-muted-foreground px-2 text-xs group-data-[collapsible=icon]:hidden">
					100% on-device. No uploads, no tracking.
				</p>
			</SidebarFooter>
		</Sidebar>
	);
}
