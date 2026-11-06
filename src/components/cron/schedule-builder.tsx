import { Info } from "lucide-react";
import { type CSSProperties, useState } from "react";

import { Input } from "#/components/ui/input.tsx";
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

// Keyed by the cron weekday number, so the order the buttons are drawn in
// (WEEK_ORDER) never has to line up with this table by position.
const DAY_LABELS: Record<number, { short: string; name: string }> = {
	0: { short: "Su", name: "Sunday" },
	1: { short: "Mo", name: "Monday" },
	2: { short: "Tu", name: "Tuesday" },
	3: { short: "We", name: "Wednesday" },
	4: { short: "Th", name: "Thursday" },
	5: { short: "Fr", name: "Friday" },
	6: { short: "Sa", name: "Saturday" },
};

// Keeps a value the chips do not list (typed in as text, say) visible and checked.
const withValue = (choices: ReadonlyArray<number>, value: number) =>
	choices.includes(value) ? choices : [...choices, value].sort((a, b) => a - b);

const CHIP =
	"relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 font-mono text-sm transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out select-none hover:bg-muted active:scale-[0.97] has-[input:checked]:border-primary has-[input:checked]:bg-primary/10 has-[input:checked]:font-bold has-[input:checked]:ring-1 has-[input:checked]:ring-primary has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 motion-reduce:active:scale-100";

const FIELD_CONTROL =
	"h-11 rounded-md border border-input bg-background px-3 font-mono text-base md:text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Frequency({
	mode,
	onChange,
}: {
	readonly mode: BuilderMode | undefined;
	readonly onChange: (mode: BuilderMode) => void;
}) {
	const index = BUILDER_MODES.findIndex((entry) => entry.mode === mode);

	return (
		<fieldset>
			<legend className="sr-only">How often</legend>
			<div
				className="relative grid grid-cols-[repeat(var(--n),minmax(0,1fr))] rounded-lg border border-input bg-background p-[3px]"
				style={
					{
						"--i": Math.max(index, 0),
						"--n": BUILDER_MODES.length,
					} as CSSProperties
				}
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
	const value = `${pad(hour)}:${pad(minute)}`;

	// A time input reports an empty string while someone is part way through
	// typing it. Keep that text so the segments are not reset under the cursor.
	const [draft, setDraft] = useState(value);
	const [syncedValue, setSyncedValue] = useState(value);

	if (value !== syncedValue) {
		setSyncedValue(value);
		setDraft(value);
	}

	function change(text: string) {
		setDraft(text);

		const [h, m] = text.split(":").map(Number);

		if (h !== undefined && m !== undefined && !Number.isNaN(h + m)) {
			onChange({ hour: h, minute: m });
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<label
				htmlFor="cron-time"
				className="text-[0.8125rem] font-semibold text-muted-foreground"
			>
				At what time?
			</label>
			<Input
				id="cron-time"
				type="time"
				value={draft}
				onChange={(event) => change(event.target.value)}
				// An emptied field has no time to keep, so show the one in use again.
				onBlur={() => setDraft(value)}
				className={cn(FIELD_CONTROL, "sm:w-44")}
			/>
		</div>
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
			<label
				htmlFor="cron-day-of-month"
				className="text-[0.8125rem] font-semibold text-muted-foreground"
			>
				On which day of the month?
			</label>
			<select
				id="cron-day-of-month"
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
				className={cn(FIELD_CONTROL, "font-sans sm:w-44")}
			>
				{Array.from({ length: 31 }, (_, at) => at + 1).map((day) => (
					<option key={day} value={day}>
						{ordinal(day)}
					</option>
				))}
			</select>
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
