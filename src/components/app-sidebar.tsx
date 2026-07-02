import { Link, useRouterState } from "@tanstack/react-router";
import {
	Cat,
	Combine,
	Eraser,
	FileDiff,
	FileStack,
	FileText,
	Film,
	Home,
	ImageIcon,
	Scaling,
	Scissors,
	ScrollText,
	Star,
} from "lucide-react";
import type React from "react";

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
} from "#/components/ui/sidebar.tsx";

const homeItem = { to: "/", label: "Home", icon: Home } as const;

const imageItems = [
	{ to: "/converter", label: "Image Converter", icon: ImageIcon },
	{ to: "/resizer", label: "Image Resizer", icon: Scaling },
	{ to: "/background-removal", label: "Remove Background", icon: Eraser },
	{ to: "/favicon-generator", label: "Favicon Generator", icon: Star },
] as const;

const videoItems = [
	{ to: "/video-converter", label: "Video Converter", icon: Film },
	{ to: "/video-cutter", label: "Video Cutter", icon: Scissors },
] as const;

const fileItems = [
	{ to: "/markdown-preview", label: "Markdown Preview", icon: ScrollText },
	{ to: "/diff-viewer", label: "Diff Viewer", icon: FileDiff },
	{ to: "/pdf-split", label: "Split PDF", icon: FileStack },
	{ to: "/pdf-merge", label: "Merge PDFs", icon: Combine },
	{ to: "/office-to-pdf", label: "Word to PDF", icon: FileText },
] as const;

type NavItem = {
	to: string;
	label: string;
	icon: React.ElementType;
};

function SidebarNavItem({
	item,
	pathname,
}: {
	item: NavItem;
	pathname: string;
}) {
	const isActive =
		item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				isActive={isActive}
				tooltip={item.label}
				render={<Link to={item.to} />}
			>
				<item.icon />
				<span>{item.label}</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

export function AppSidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<Sidebar variant="sidebar" collapsible="icon">
			<SidebarHeader>
				<div className="flex items-center gap-2 px-1 py-1.5">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
						<Cat />
					</div>
					<div className="grid flex-1 leading-tight group-data-[collapsible=icon]:hidden">
						<span className="text-base font-bold">Palico</span>
						<span className="text-muted-foreground text-xs">
							Client first tools
						</span>
					</div>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarNavItem item={homeItem} pathname={pathname} />
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarGroupLabel>Image</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{imageItems.map((item) => (
								<SidebarNavItem key={item.to} item={item} pathname={pathname} />
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarGroupLabel>Video</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{videoItems.map((item) => (
								<SidebarNavItem key={item.to} item={item} pathname={pathname} />
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarGroupLabel>File</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{fileItems.map((item) => (
								<SidebarNavItem key={item.to} item={item} pathname={pathname} />
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<p className="text-muted-foreground px-2 text-xs group-data-[collapsible=icon]:hidden">
					100% on-device. No uploads, no tracking.
				</p>
			</SidebarFooter>
		</Sidebar>
	);
}
