import { useRouterState } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

import { OfflineInfo } from "#/components/offline/offline-info.tsx";
import { ToolStar } from "#/components/tool-star.tsx";
import {
	CATEGORY_STYLES,
	categoryOfPath,
	TOOLS,
} from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";

const WIDTHS = {
	narrow: "max-w-3xl",
	wide: "max-w-5xl",
	full: "max-w-7xl",
} as const;

export type PageWidth = keyof typeof WIDTHS;

export function PageShell({
	width = "narrow",
	className,
	...props
}: { width?: PageWidth } & ComponentProps<"div">) {
	return (
		<div
			className={cn("mx-auto w-full px-6 py-10", WIDTHS[width], className)}
			{...props}
		/>
	);
}

export function PageHeader({
	title,
	children,
	actions,
}: {
	title: string;
	/** The description paragraph. */
	children: ReactNode;
	actions?: ReactNode;
}) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const category = categoryOfPath(pathname);
	const tool = TOOLS.find((t) => t.to === pathname);

	return (
		<div className="mb-6 flex items-start justify-between gap-4">
			<div>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<h1 className="text-2xl font-bold">{title}</h1>
					{tool && <ToolStar tool={tool} className="-mx-1.5" />}
					{category && (
						// Tint only: a Latte accent as text fails contrast, so the label stays foreground.
						<span
							className={cn(
								"rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground",
								CATEGORY_STYLES[category].chip,
							)}
						>
							{CATEGORY_STYLES[category].label}
						</span>
					)}
					{tool && <OfflineInfo engine={tool.engine} />}
				</div>
				<p className="mt-1 text-sm text-muted-foreground">{children}</p>
			</div>
			{actions}
		</div>
	);
}
