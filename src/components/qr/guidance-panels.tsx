import {
	ChevronRight,
	CircleAlert,
	Lightbulb,
	TriangleAlert,
} from "lucide-react";

import { type Advice, SCAN_TIPS } from "#/lib/qr/guidance.ts";
import { cn } from "#/lib/utils.ts";

const LOOK: Record<Advice["severity"], string> = {
	error: "bg-destructive/15",
	warning: "bg-warning/25",
	tip: "bg-info/20",
};

const ICON_LOOK: Record<Advice["severity"], string> = {
	error: "text-destructive",
	warning: "text-foreground",
	tip: "text-foreground",
};

function AdviceIcon({ severity }: { readonly severity: Advice["severity"] }) {
	const className = cn("mt-0.5 size-4 shrink-0", ICON_LOOK[severity]);

	if (severity === "error")
		return <CircleAlert aria-hidden className={className} />;

	return severity === "warning" ? (
		<TriangleAlert aria-hidden className={className} />
	) : (
		<Lightbulb aria-hidden className={className} />
	);
}

/**
 * Live checks on what the person is making. Errors are announced at once;
 * warnings and tips are polite, so they never interrupt typing.
 */
export function AdviceList({
	advice,
}: {
	readonly advice: ReadonlyArray<Advice>;
}) {
	if (advice.length === 0) return null;

	return (
		<ul className="flex flex-col gap-2">
			{advice.map((item) => {
				// The live role sits on an inner element, so the <li> keeps its list
				// semantics. No entrance animation: these change as the person types.
				const className = cn(
					"flex gap-2.5 rounded-md px-3 py-2.5 text-sm text-foreground",
					LOOK[item.severity],
				);
				const body = (
					<>
						<AdviceIcon severity={item.severity} />
						<span>{item.message}</span>
					</>
				);

				return (
					<li key={item.kind}>
						{item.severity === "error" ? (
							<div role="alert" className={className}>
								{body}
							</div>
						) : (
							<output className={className}>{body}</output>
						)}
					</li>
				);
			})}
		</ul>
	);
}

/** The static "how to make a code that scans" checklist, collapsed by default. */
export function ScanTips() {
	return (
		<details className="group border-t pt-2">
			<summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1 py-2 text-sm font-medium outline-none select-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
				<ChevronRight
					aria-hidden
					className="size-4 text-muted-foreground transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none"
				/>
				Making it scannable
			</summary>
			<ol className="flex flex-col gap-3 px-1 pt-1 pb-2 text-sm">
				{SCAN_TIPS.map((tip, index) => (
					<li key={tip.title} className="flex gap-3">
						<span
							aria-hidden
							className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cat-file/20 text-xs font-semibold text-foreground"
						>
							{index + 1}
						</span>
						<span>
							<span className="font-medium">{tip.title}.</span>{" "}
							<span className="text-muted-foreground">{tip.body}</span>
						</span>
					</li>
				))}
			</ol>
		</details>
	);
}
