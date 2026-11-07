import type { CSSProperties } from "react";

import { cn } from "#/lib/utils.ts";

export interface Segment<T extends string> {
	readonly value: T;
	readonly label: string;
}

/**
 * A row of radio choices in one pill. The radios are real inputs, so arrow keys
 * and screen readers work as they do for any radio group. The highlight slides
 * with a transform. Targets are 44px tall below `sm`.
 */
export function SegmentedControl<T extends string>({
	legend,
	name,
	segments,
	value,
	onChange,
	className,
	disabled = false,
}: {
	/** The name a screen reader reads for the group. It is not drawn. */
	readonly legend: string;
	readonly name: string;
	readonly segments: ReadonlyArray<Segment<T>>;
	readonly value: T | undefined;
	readonly onChange: (value: T) => void;
	readonly className?: string;
	/** Turns every segment off, for a job that must not be interrupted. */
	readonly disabled?: boolean;
}) {
	const index = segments.findIndex((segment) => segment.value === value);

	// SAFETY: React types style by known property names only. --i and --n are
	// custom properties that the class names below read through var().
	const style = {
		"--i": Math.max(index, 0),
		"--n": segments.length,
	} as CSSProperties;

	return (
		<fieldset className={className} disabled={disabled}>
			<legend className="sr-only">{legend}</legend>
			<div
				className={cn(
					"relative grid grid-cols-[repeat(var(--n),minmax(0,1fr))] rounded-lg border border-input bg-background p-[3px]",
					disabled && "pointer-events-none opacity-60",
				)}
				style={style}
			>
				{/* Transform only, and hidden when no segment is chosen. */}
				<span
					aria-hidden
					className={cn(
						"absolute inset-y-[3px] left-[3px] w-[calc((100%-6px)/var(--n))] translate-x-[calc(var(--i)*100%)] rounded-md bg-primary transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-opacity",
						index < 0 && "opacity-0",
					)}
				/>
				{segments.map((segment) => (
					<label
						key={segment.value}
						className={cn(
							"relative z-10 flex min-h-11 cursor-pointer items-center justify-center rounded-md px-1.5 text-[0.8125rem] font-semibold transition-[color,transform] duration-150 ease-out select-none active:scale-[0.97] motion-reduce:active:scale-100 has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 sm:min-h-8 sm:text-sm",
							segment.value === value
								? "text-primary-foreground"
								: "text-foreground",
						)}
					>
						<input
							type="radio"
							name={name}
							value={segment.value}
							checked={segment.value === value}
							onChange={() => onChange(segment.value)}
							className="sr-only"
						/>
						{segment.label}
					</label>
				))}
			</div>
		</fieldset>
	);
}
