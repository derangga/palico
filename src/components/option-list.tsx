import { Check } from "lucide-react";

import { cn } from "#/lib/utils.ts";

/**
 * The rows of a bottom sheet that picks one value: 48px tall, the chosen one
 * tinted and ticked. `lang` marks a row written in another language, such as
 * a language's own name.
 */
export function OptionList<T extends string>({
	options,
	value,
	onPick,
}: {
	readonly options: ReadonlyArray<{
		readonly value: T;
		readonly label: string;
		readonly lang?: string;
	}>;
	readonly value: T;
	readonly onPick: (value: T) => void;
}) {
	return (
		<ul className="flex flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-3">
			{options.map((option) => {
				const selected = option.value === value;

				return (
					<li key={option.value}>
						<button
							type="button"
							lang={option.lang}
							aria-current={selected ? "true" : undefined}
							onClick={() => onPick(option.value)}
							className={cn(
								"flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[0.9375rem] font-semibold transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
								selected && "bg-primary/10",
							)}
						>
							<span className="flex-1">{option.label}</span>
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
	);
}
