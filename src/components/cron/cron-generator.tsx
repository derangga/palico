import { Effect } from "effect";
import { useMemo, useState } from "react";

import { ExpressionEditor } from "#/components/cron/expression-editor.tsx";
import { NextRuns } from "#/components/cron/next-runs.tsx";
import { ScheduleBuilder } from "#/components/cron/schedule-builder.tsx";
import {
	ScheduleReadout,
	STATUS_ID,
} from "#/components/cron/schedule-readout.tsx";
import { TemplatePicker } from "#/components/cron/template-picker.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { useMinuteClock } from "#/hooks/use-minute-clock.ts";
import {
	type BuilderState,
	builderFromSchedule,
	DEFAULT_BUILDER,
	expressionFromBuilder,
} from "#/lib/cron/builder.ts";
import { describeSchedule } from "#/lib/cron/describe.ts";
import type { CronSyntaxError } from "#/lib/cron/errors.ts";
import type { CronZone } from "#/lib/cron/next-runs.ts";
import {
	type CronSchedule,
	parseCron,
	splitFields,
} from "#/lib/cron/schedule.ts";
import { DEFAULT_EXPRESSION } from "#/lib/cron/templates.ts";
import { m } from "#/paraglide/messages.js";

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

// What the builder shows for an expression. Undefined when the form cannot
// show it, which happens for lists of hours, steps inside a range and the like.
const builderFor = (
	expression: string,
	base: BuilderState,
): BuilderState | undefined => {
	const { schedule } = parse(expression);

	return schedule ? builderFromSchedule(schedule, base) : undefined;
};

export function CronGenerator() {
	// The expression is the schedule. The builder and the text box both read it
	// and write it, and neither keeps a copy of its own.
	const [expression, setExpression] = useState(DEFAULT_EXPRESSION);

	// Kept apart so a weekly schedule with every day ticked (`*`) stays weekly
	// instead of turning into a daily one under the person's finger.
	const [builder, setBuilder] = useState<BuilderState | undefined>(() =>
		builderFor(DEFAULT_EXPRESSION, DEFAULT_BUILDER),
	);

	// The last schedule the form could show. Typing passes through expressions
	// it cannot (a half-written field), and the details should survive that.
	const [lastBuilder, setLastBuilder] = useState(
		() => builder ?? DEFAULT_BUILDER,
	);

	const [editing, setEditing] = useState(false);
	const [activeField, setActiveField] = useState<number | undefined>();
	const [zone, setZone] = useState<CronZone>("local");
	const clock = useMinuteClock();

	const now = useMemo(
		() => (clock === undefined ? undefined : new Date(clock)),
		[clock],
	);

	const { schedule, error } = useMemo(() => parse(expression), [expression]);

	const sentence = useMemo(
		() => (schedule ? describeSchedule(schedule) : undefined),
		[schedule],
	);

	function loadExpression(next: string) {
		const shown = builderFor(next, lastBuilder);

		setExpression(next);
		setBuilder(shown);

		if (shown) setLastBuilder(shown);
	}

	function changeBuilder(next: BuilderState) {
		setBuilder(next);
		setLastBuilder(next);
		setExpression(expressionFromBuilder(next));
	}

	function pickTemplate(next: string) {
		loadExpression(next);
		setEditing(false);
		setActiveField(undefined);
	}

	// Leaving the box settles it: a good expression is written out in full
	// (@daily becomes 0 0 * * *), a bad one stays so the error has something to point at.
	function settleExpression() {
		if (schedule) setExpression(splitFields(expression).join(" "));
	}

	function toggleEditing() {
		setEditing((current) => !current);
		setActiveField(undefined);
	}

	return (
		<PageShell width="wide">
			<PageHeader title={m.tool_cron_generator_label()}>
				{m.cron_header_desc()}
			</PageHeader>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
				<div className="flex flex-col gap-6">
					<ScheduleReadout
						expression={expression}
						sentence={sentence}
						error={error}
						activeField={editing ? activeField : undefined}
						editing={editing}
						onToggleEditing={toggleEditing}
					/>

					<section
						aria-label={m.cron_schedule_aria()}
						className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
					>
						<div className="flex min-h-9 items-center justify-between gap-2">
							<h2 className="text-sm font-semibold">
								{editing ? m.cron_title_expression() : m.cron_title_how_often()}
							</h2>
							<TemplatePicker
								current={expression.trim()}
								onPick={pickTemplate}
							/>
						</div>

						{editing ? (
							<ExpressionEditor
								value={expression}
								invalid={error !== undefined}
								describedBy={STATUS_ID}
								activeField={activeField}
								onChange={loadExpression}
								onSettle={settleExpression}
								onActiveFieldChange={setActiveField}
							/>
						) : (
							<ScheduleBuilder
								state={builder}
								base={lastBuilder}
								onChange={changeBuilder}
							/>
						)}
					</section>
				</div>

				<NextRuns
					schedule={schedule}
					now={now}
					zone={zone}
					onZoneChange={setZone}
				/>
			</div>
		</PageShell>
	);
}
