import { Info } from "lucide-react";
import type { CSSProperties } from "react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import {
	BUILDER_MODES,
	type BuilderMode,
	type BuilderState,
	WEEK_ORDER,
} from "#/lib/cron/builder.ts";
import { ordinal, pad } from "#/lib/cron/describe.ts";
import { cn } from "#/lib/utils.ts";

const EVERY_CHOICES = [1, 2, 5, 10, 15, 20, 30];
const MINUTE_CHOICES = [0, 15, 30, 45];

// Indexed by the cron weekday number (0 is Sunday), not by where the button is
// drawn, so the order in WEEK_ORDER never has to line up with this by position.
const DAY_LABELS = [
	{ short: "Su", name: "Sunday" },
	{ short: "Mo", name: "Monday" },
	{ short: "Tu", name: "Tuesday" },
	{ short: "We", name: "Wednesday" },
	{ short: "Th", name: "Thursday" },
	{ short: "Fr", name: "Friday" },
	{ short: "Sa", name: "Saturday" },
] as const;

// Keeps a value the chips do not list (typed in as text, say) visible and checked.
const withValue = (choices: ReadonlyArray<number>, value: number) =>
	choices.includes(value) ? choices : [...choices, value].sort((a, b) => a - b);

const CHIP =
	"relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 font-mono text-sm transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out select-none hover:bg-muted active:scale-[0.97] has-[input:checked]:border-primary has-[input:checked]:bg-primary/10 has-[input:checked]:font-bold has-[input:checked]:ring-1 has-[input:checked]:ring-primary has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 motion-reduce:active:scale-100";

const toItems = (values: ReadonlyArray<number>, label: (n: number) => string) =>
	values.map((n) => ({ value: String(n), label: label(n) }));

const HOURS = toItems(
	Array.from({ length: 24 }, (_, at) => at),
	pad,
);

const MINUTES = toItems(
	Array.from({ length: 60 }, (_, at) => at),
	pad,
);

const DAYS_OF_MONTH = toItems(
	Array.from({ length: 31 }, (_, at) => at + 1),
	ordinal,
);

// h-11 keeps the 44px touch target. It has to name the data-size variant, because
// SelectTrigger sets its own height through one and a plain h-11 would lose.
const SELECT_TRIGGER =
	"font-mono text-base transition-[color,border-color,box-shadow,scale] active:scale-[0.97] data-[size=default]:h-11 motion-reduce:active:scale-100";

function NumberSelect({
	items,
	value,
	onChange,
	triggerClassName,
	contentClassName,
	...label
}: {
	readonly items: ReadonlyArray<{ value: string; label: string }>;
	readonly value: number;
	readonly onChange: (value: number) => void;
	readonly triggerClassName?: string;
	readonly contentClassName?: string;
} & (
	| { readonly "aria-label": string }
	| { readonly "aria-labelledby": string }
)) {
	return (
		<Select
			items={items}
			value={String(value)}
			onValueChange={(next) => {
				if (next !== null) onChange(Number(next));
			}}
		>
			<SelectTrigger
				className={cn(SELECT_TRIGGER, triggerClassName)}
				{...label}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent
				// Open under the field. Aligning the chosen row over it needs the full
				// list height, which the cap below takes away.
				alignItemWithTrigger={false}
				className={cn(
					// The base popup fills the viewport. About seven rows is enough, and
					// the min() keeps it inside a short screen.
					"max-h-[min(16rem,var(--available-height))]",
					contentClassName,
				)}
			>
				{items.map((item) => (
					<SelectItem key={item.value} value={item.value} className="font-mono">
						{item.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function Frequency({
	mode,
	onChange,
}: {
	readonly mode: BuilderMode | undefined;
	readonly onChange: (mode: BuilderMode) => void;
}) {
	const index = BUILDER_MODES.findIndex((entry) => entry.mode === mode);

	// SAFETY: React types style by known property names only. --i and --n are
	// custom properties that the class names below read through var().
	const style = {
		"--i": Math.max(index, 0),
		"--n": BUILDER_MODES.length,
	} as CSSProperties;

	return (
		<fieldset>
			<legend className="sr-only">How often</legend>
			<div
				className="relative grid grid-cols-[repeat(var(--n),minmax(0,1fr))] rounded-lg border border-input bg-background p-[3px]"
				style={style}
			>
				{/* The pill slides with transform only, and hides when no mode fits. */}
				<span
					aria-hidden
					className={cn(
						"absolute inset-y-[3px] left-[3px] w-[calc((100%-6px)/var(--n))] translate-x-[calc(var(--i)*100%)] rounded-md bg-primary transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-opacity",
						index < 0 && "opacity-0",
					)}
				/>
				{BUILDER_MODES.map((entry) => (
					<label
						key={entry.mode}
						className={cn(
							"relative z-10 flex min-h-11 cursor-pointer items-center justify-center rounded-md text-[0.8125rem] font-semibold transition-colors duration-150 select-none has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 sm:text-sm",
							entry.mode === mode
								? "text-primary-foreground"
								: "text-foreground",
						)}
					>
						<input
							type="radio"
							name="cron-frequency"
							value={entry.mode}
							checked={entry.mode === mode}
							onChange={() => onChange(entry.mode)}
							className="sr-only"
						/>
						{entry.label}
					</label>
				))}
			</div>
		</fieldset>
	);
}

function ChipChoice({
	legend,
	name,
	choices,
	value,
	format,
	onChange,
}: {
	readonly legend: string;
	readonly name: string;
	readonly choices: ReadonlyArray<number>;
	readonly value: number;
	readonly format: (value: number) => string;
	readonly onChange: (value: number) => void;
}) {
	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="mb-2 text-[0.8125rem] font-semibold text-muted-foreground">
				{legend}
			</legend>
			<div className="flex flex-wrap gap-2">
				{withValue(choices, value).map((choice) => (
					<label key={choice} className={CHIP}>
						<input
							type="radio"
							name={name}
							value={choice}
							checked={choice === value}
							onChange={() => onChange(choice)}
							className="sr-only"
						/>
						{format(choice)}
					</label>
				))}
			</div>
		</fieldset>
	);
}

function DayPicker({
	days,
	onChange,
}: {
	readonly days: ReadonlyArray<number>;
	readonly onChange: (days: ReadonlyArray<number>) => void;
}) {
	function toggle(day: number) {
		if (!days.includes(day)) return onChange([...days, day]);

		// A weekly schedule needs a day, so the last one stays on.
		if (days.length > 1) onChange(days.filter((entry) => entry !== day));
	}

	const lastDay = days.length === 1 ? days[0] : undefined;

	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="mb-2 text-[0.8125rem] font-semibold text-muted-foreground">
				On which days?
			</legend>
			<div className="grid grid-cols-7 gap-1 sm:gap-2">
				{WEEK_ORDER.map((day) => {
					const weekday = DAY_LABELS[day];

					return (
						<label
							key={day}
							className={cn(
								CHIP,
								"min-w-0 px-0 font-sans font-bold has-[input:disabled]:cursor-default",
							)}
						>
							<input
								type="checkbox"
								checked={days.includes(day)}
								disabled={day === lastDay}
								onChange={() => toggle(day)}
								className="sr-only"
							/>
							<span aria-hidden>{weekday?.short}</span>
							<span className="sr-only">{weekday?.name}</span>
						</label>
					);
				})}
			</div>
			{lastDay !== undefined && (
				<p className="text-xs text-muted-foreground">
					A weekly schedule keeps at least one day.
				</p>
			)}
		</fieldset>
	);
}

function TimeField({
	hour,
	minute,
	onChange,
}: {
	readonly hour: number;
	readonly minute: number;
	readonly onChange: (time: { hour: number; minute: number }) => void;
}) {
	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="mb-2 text-[0.8125rem] font-semibold text-muted-foreground">
				At what time?
			</legend>
			<div className="flex items-center gap-2">
				<NumberSelect
					aria-label="Hour"
					items={HOURS}
					value={hour}
					onChange={(next) => onChange({ hour: next, minute })}
					triggerClassName="w-[4.5rem]"
					contentClassName="min-w-24"
				/>
				<span aria-hidden className="font-mono text-base text-muted-foreground">
					:
				</span>
				<NumberSelect
					aria-label="Minute"
					items={MINUTES}
					value={minute}
					onChange={(next) => onChange({ hour, minute: next })}
					triggerClassName="w-[4.5rem]"
					contentClassName="min-w-24"
				/>
			</div>
		</fieldset>
	);
}

function DayOfMonthField({
	value,
	onChange,
}: {
	readonly value: number;
	readonly onChange: (day: number) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span
				id="cron-day-of-month"
				className="text-[0.8125rem] font-semibold text-muted-foreground"
			>
				On which day of the month?
			</span>
			<NumberSelect
				aria-labelledby="cron-day-of-month"
				items={DAYS_OF_MONTH}
				value={value}
				onChange={onChange}
				triggerClassName="w-28 font-sans"
				contentClassName="min-w-28"
			/>
			{value > 28 && (
				<p className="text-xs text-muted-foreground">
					Months with fewer days are skipped.
				</p>
			)}
		</div>
	);
}

/**
 * Pick how often, then fill in the one or two details that apply. A state of
 * undefined means the expression is something the form cannot show.
 */
export function ScheduleBuilder({
	state,
	base,
	onChange,
}: {
	readonly state: BuilderState | undefined;
	/** The last schedule the form could show. Picking a mode from the notice keeps its details. */
	readonly base: BuilderState;
	readonly onChange: (state: BuilderState) => void;
}) {
	const current = state ?? base;

	const patch = (next: Partial<BuilderState>) =>
		onChange({ ...current, ...next });

	return (
		<div className="flex flex-col gap-4">
			<Frequency
				mode={state?.mode}
				onChange={(mode) => onChange({ ...current, mode })}
			/>

			{!state && (
				<p className="flex gap-2.5 rounded-lg bg-info/20 p-3 text-sm">
					<Info aria-hidden className="mt-0.5 size-4 shrink-0" />
					The builder cannot show this schedule. Pick how often to replace it,
					or keep editing it as text.
				</p>
			)}

			{state?.mode === "minutes" && (
				<ChipChoice
					legend="Every how many minutes?"
					name="cron-every"
					choices={EVERY_CHOICES}
					value={state.every}
					format={String}
					onChange={(every) => patch({ every })}
				/>
			)}

			{state?.mode === "hourly" && (
				<ChipChoice
					legend="At which minute of the hour?"
					name="cron-minute"
					choices={MINUTE_CHOICES}
					value={state.minute}
					format={(minute) => `:${pad(minute)}`}
					onChange={(minute) => patch({ minute })}
				/>
			)}

			{state?.mode === "weekly" && (
				<DayPicker days={state.days} onChange={(days) => patch({ days })} />
			)}

			{state?.mode === "monthly" && (
				<DayOfMonthField
					value={state.dayOfMonth}
					onChange={(dayOfMonth) => patch({ dayOfMonth })}
				/>
			)}

			{state &&
				(state.mode === "daily" ||
					state.mode === "weekly" ||
					state.mode === "monthly") && (
					<TimeField hour={state.hour} minute={state.minute} onChange={patch} />
				)}
		</div>
	);
}
