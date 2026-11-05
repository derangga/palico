import { Effect } from "effect";
import { CircleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { CopyTextButton } from "#/components/copy-text-button.tsx";
import { NextRuns } from "#/components/cron/next-runs.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { Input } from "#/components/ui/input.tsx";
import { useMinuteClock } from "#/hooks/use-minute-clock.ts";
import { describeSchedule } from "#/lib/cron/describe.ts";
import type { CronSyntaxError } from "#/lib/cron/errors.ts";
import type { CronZone } from "#/lib/cron/next-runs.ts";
import { PRESETS } from "#/lib/cron/presets.ts";
import {
	type CronFieldName,
	type CronSchedule,
	expandMacro,
	FIELD_NAMES,
	parseCron,
} from "#/lib/cron/schedule.ts";
import { cn } from "#/lib/utils.ts";

const FIELD_LABELS: Record<
	CronFieldName,
	{ readonly label: string; readonly hint: string }
> = {
	minute: { label: "Minute", hint: "0 to 59" },
	hour: { label: "Hour", hint: "0 to 23" },
	dayOfMonth: { label: "Day of month", hint: "1 to 31" },
	month: { label: "Month", hint: "1 to 12 or JAN to DEC" },
	dayOfWeek: { label: "Day of week", hint: "0 to 6 or SUN to SAT" },
};

const SYNTAX: ReadonlyArray<{
	readonly symbol: string;
	readonly meaning: string;
	readonly example: string;
}> = [
	{
		symbol: "*",
		meaning: "every value",
		example: "* in hour means every hour",
	},
	{
		symbol: ",",
		meaning: "a list",
		example: "1,15 in day of month means the 1st and 15th",
	},
	{
		symbol: "-",
		meaning: "a range",
		example: "1-5 in day of week means Monday to Friday",
	},
	{
		symbol: "/",
		meaning: "a step",
		example: "*/10 in minute means every 10 minutes",
	},
];

const FIRST_PRESET = PRESETS.find(
	({ expression }) => expression === "0 9 * * 1-5",
);

const STATUS_ID = "cron-status";
const INPUT_ID = "cron-expression";

type Parsed =
	| { readonly schedule: CronSchedule; readonly error: undefined }
	| { readonly schedule: undefined; readonly error: CronSyntaxError };

const parse = (expression: string): Parsed =>
	Effect.runSync(
		parseCron(expression).pipe(
			Effect.match({
				onSuccess: (schedule): Parsed => ({ schedule, error: undefined }),
				onFailure: (error): Parsed => ({ schedule: undefined, error }),
			}),
		),
	);

const splitFields = (expression: string): Array<string> =>
	expandMacro(expression.trim()).split(/\s+/);

export function CronGenerator() {
	const [fields, setFields] = useState<ReadonlyArray<string>>(() =>
		splitFields(FIRST_PRESET?.expression ?? "* * * * *"),
	);

	// What the person typed in the whole-expression box. Null means the box
	// shows the five fields joined, so typing there never rewrites itself.
	const [draft, setDraft] = useState<string | null>(null);
	const [zone, setZone] = useState<CronZone>("local");
	const clock = useMinuteClock();

	const now = useMemo(
		() => (clock === undefined ? undefined : new Date(clock)),
		[clock],
	);

	const expression = draft ?? fields.join(" ");
	const { schedule, error } = useMemo(() => parse(expression), [expression]);

	const sentence = useMemo(
		() => (schedule ? describeSchedule(schedule) : undefined),
		[schedule],
	);

	function applyExpression(next: string) {
		const tokens = splitFields(next);

		// Anything but five fields keeps the old ones, so the inputs do not jump
		// around while someone is part way through typing.
		if (tokens.length === 5) setFields(tokens);
	}

	function changeExpression(next: string) {
		setDraft(next);
		applyExpression(next);
	}

	// Leaving the box settles it: a good expression is written out in full
	// (@daily becomes 0 0 * * *), a bad one stays so the error has something to point at.
	function settleExpression() {
		if (draft !== null && parse(draft).schedule) setDraft(null);
	}

	function changeField(index: number, value: string) {
		setFields((current) =>
			current.map((text, at) =>
				at === index ? value.replace(/\s/g, "") : text,
			),
		);
		setDraft(null);
	}

	function choosePreset(preset: string) {
		applyExpression(preset);
		setDraft(null);
	}

	return (
		<PageShell width="wide">
			<PageHeader title="Cron Generator">
				Build a cron schedule from presets or fields, read it in plain English
				and check when it runs next. Everything happens on your device.
			</PageHeader>

			<div className="flex flex-col gap-6">
				<section
					aria-label="Cron expression"
					className="animate-pop-in flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm"
				>
					<div className="flex flex-col gap-2">
						<label htmlFor={INPUT_ID} className="text-sm font-medium">
							Cron expression
						</label>
						<div className="flex flex-col gap-2 sm:flex-row">
							<Input
								id={INPUT_ID}
								value={expression}
								onChange={(event) => changeExpression(event.target.value)}
								onBlur={settleExpression}
								onKeyDown={(event) => {
									if (event.key === "Enter") settleExpression();
								}}
								aria-invalid={error !== undefined}
								aria-describedby={STATUS_ID}
								spellCheck={false}
								autoComplete="off"
								autoCapitalize="off"
								className="h-11 font-mono text-lg"
							/>
							{schedule && (
								<CopyTextButton
									label="Copy"
									getText={() => expression.trim()}
									copiedMessage={`Copied ${expression.trim()}`}
									failureMessage="Couldn't copy the expression."
								/>
							)}
						</div>
					</div>

					<p
						id={STATUS_ID}
						aria-live="polite"
						className={cn(
							"flex gap-2",
							sentence ? "text-lg font-semibold" : "text-sm",
						)}
					>
						{error && (
							<CircleAlert
								aria-hidden
								className="mt-0.5 size-4 shrink-0 text-destructive"
							/>
						)}
						{sentence ?? error?.message}
					</p>
				</section>

				<section aria-label="Presets" className="flex flex-col gap-2">
					<h2 className="text-sm font-medium">Start from a preset</h2>
					<ul className="flex flex-wrap gap-2">
						{PRESETS.map((preset) => {
							const active = expression.trim() === preset.expression;

							return (
								<li key={preset.expression}>
									<button
										type="button"
										aria-pressed={active}
										onClick={() => choosePreset(preset.expression)}
										className="rounded-full border border-input bg-background px-3 py-1.5 text-sm transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] aria-pressed:border-primary aria-pressed:bg-primary/10 motion-reduce:active:scale-100"
									>
										{preset.label}
									</button>
								</li>
							);
						})}
					</ul>
				</section>

				<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
					<div className="flex flex-col gap-6">
						<section
							aria-label="Fields"
							className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm"
						>
							<h2 className="text-sm font-medium">Fields</h2>
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
								{FIELD_NAMES.map((name, index) => {
									const id = `cron-field-${name}`;

									return (
										<div key={name} className="flex flex-col gap-1">
											<label htmlFor={id} className="text-xs font-semibold">
												{FIELD_LABELS[name].label}
											</label>
											<Input
												id={id}
												value={fields[index] ?? ""}
												onChange={(event) =>
													changeField(index, event.target.value)
												}
												aria-invalid={error?.field === name}
												aria-describedby={`${id}-hint`}
												spellCheck={false}
												autoComplete="off"
												autoCapitalize="off"
												className="font-mono"
											/>
											<span
												id={`${id}-hint`}
												className="text-xs text-muted-foreground"
											>
												{FIELD_LABELS[name].hint}
											</span>
										</div>
									);
								})}
							</div>
						</section>

						<section
							aria-label="Syntax"
							className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm"
						>
							<h2 className="text-sm font-medium">What the symbols mean</h2>
							<dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
								{SYNTAX.map(({ symbol, meaning, example }) => (
									<div key={symbol} className="contents">
										<dt className="font-mono font-semibold">{symbol}</dt>
										<dd className="text-muted-foreground">
											{meaning}. {example}.
										</dd>
									</div>
								))}
							</dl>
							<p className="text-xs text-muted-foreground">
								When both day of month and day of week are set, the job runs on
								either one. Shortcuts like @daily and @hourly also work.
							</p>
						</section>
					</div>

					<NextRuns
						schedule={schedule}
						now={now}
						zone={zone}
						onZoneChange={setZone}
					/>
				</div>
			</div>
		</PageShell>
	);
}
