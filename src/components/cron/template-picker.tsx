import { Check, ListChecks } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover.tsx";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "#/components/ui/sheet.tsx";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import { TEMPLATES_BY_GROUP } from "#/lib/cron/templates.ts";
import { cn } from "#/lib/utils.ts";

function TemplateList({
	current,
	onPick,
}: {
	readonly current: string;
	readonly onPick: (expression: string) => void;
}) {
	return (
		<div className="flex flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-3">
			{TEMPLATES_BY_GROUP.map(({ group, templates }) => (
				<section key={group} aria-labelledby={`cron-template-${group}`}>
					<h3
						id={`cron-template-${group}`}
						className="px-3 pt-3 pb-1 text-xs font-bold text-muted-foreground"
					>
						{group}
					</h3>
					<ul>
						{templates.map((template) => {
							const selected = current === template.expression;

							return (
								<li key={template.expression}>
									<button
										type="button"
										aria-current={selected ? "true" : undefined}
										onClick={() => onPick(template.expression)}
										className={cn(
											"flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
											selected && "bg-primary/10",
										)}
									>
										<span className="flex-1 text-[0.9375rem] font-semibold">
											{template.label}
										</span>
										<code className="font-mono text-[0.8125rem] text-muted-foreground">
											{template.expression}
										</code>
										<Check
											aria-hidden
											className={cn(
												"size-4 shrink-0 text-primary",
												!selected && "invisible",
											)}
										/>
									</button>
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}

/**
 * A Templates button. It opens a bottom sheet on a phone, where a list needs
 * the room, and a popover under the button on larger screens.
 */
export function TemplatePicker({
	current,
	onPick,
}: {
	readonly current: string;
	readonly onPick: (expression: string) => void;
}) {
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);

	function pick(expression: string) {
		onPick(expression);
		setOpen(false);
	}

	const trigger = (
		<Button variant="ghost" size="sm" className="-mr-2 h-11 sm:h-8">
			<ListChecks />
			Templates
		</Button>
	);

	if (isMobile) {
		return (
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetTrigger render={trigger} />
				<SheetContent
					side="bottom"
					className="max-h-[82dvh] gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
				>
					<SheetHeader className="pb-1">
						<SheetTitle className="text-base font-extrabold">
							Templates
						</SheetTitle>
					</SheetHeader>
					<TemplateList current={current} onPick={pick} />
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={trigger} />
			<PopoverContent
				align="end"
				className="flex max-h-[min(30rem,70dvh)] w-[24rem] flex-col p-0 pt-1"
			>
				<h2 className="sr-only">Templates</h2>
				<TemplateList current={current} onPick={pick} />
			</PopoverContent>
		</Popover>
	);
}
