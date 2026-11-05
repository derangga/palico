import { Check } from "lucide-react";

import { cn } from "#/lib/utils.ts";

export interface Choice<T extends string> {
	readonly value: T;
	readonly label: string;
	/** A second, smaller line under the label. */
	readonly detail?: string;
}

/**
 * A row of radio choices drawn as pills. The radios are real inputs, so arrow
 * keys, focus and screen readers behave as they do for any radio group.
 */
export function ChoiceGroup<T extends string>({
	legend,
	name,
	choices,
	value,
	onChange,
	columns = "sm:grid-cols-4",
}: {
	readonly legend: string;
	readonly name: string;
	readonly choices: ReadonlyArray<Choice<T>>;
	readonly value: T;
	readonly onChange: (value: T) => void;
	readonly columns?: string;
}) {
	return (
		<fieldset>
			<legend className="mb-2 text-sm font-medium">{legend}</legend>
			<div className={cn("grid grid-cols-2 gap-2", columns)}>
				{choices.map((choice) => (
					<label
						key={choice.value}
						className="relative flex cursor-pointer flex-col rounded-md border border-input bg-background py-2 pr-8 pl-3 text-sm transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out select-none hover:bg-muted active:scale-[0.97] has-[input:checked]:border-primary has-[input:checked]:bg-primary/10 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 motion-reduce:active:scale-100"
					>
						<input
							type="radio"
							name={name}
							value={choice.value}
							checked={value === choice.value}
							onChange={() => onChange(choice.value)}
							className="peer sr-only"
						/>
						{/* A mark as well as a color, so the choice never rests on color alone. The label keeps room on the right for it. */}
						<Check
							aria-hidden
							className="absolute top-1/2 right-3 hidden size-3.5 -translate-y-1/2 text-primary peer-checked:block"
						/>
						<span className="font-medium">{choice.label}</span>
						{choice.detail && (
							<span className="text-xs text-muted-foreground">
								{choice.detail}
							</span>
						)}
					</label>
				))}
			</div>
		</fieldset>
	);
}
