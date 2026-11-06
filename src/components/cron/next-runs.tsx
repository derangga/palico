import { ChoiceGroup } from "#/components/choice-group.tsx";
import { formatRun, relativeTime } from "#/lib/cron/format.ts";
import { type CronZone, nextRuns } from "#/lib/cron/next-runs.ts";
import type { CronSchedule } from "#/lib/cron/schedule.ts";
import { m } from "#/paraglide/messages.js";

const RUN_COUNT = 8;

// A function, because the label depends on the active language.
const zones = () =>
	[
		{ value: "local", label: m.cron_zone_local() },
		{ value: "utc", label: "UTC" },
	] as const;

function Message({ children }: { readonly children: string }) {
	return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** The next few times the schedule fires, in the person's time or in UTC. */
export function NextRuns({
	schedule,
	now,
	zone,
	onZoneChange,
}: {
	readonly schedule: CronSchedule | undefined;
	/** Undefined until the page has mounted, so the server pass shows no times. */
	readonly now: Date | undefined;
	readonly zone: CronZone;
	readonly onZoneChange: (zone: CronZone) => void;
}) {
	const runs = schedule && now ? nextRuns(schedule, now, RUN_COUNT, zone) : [];

	return (
		<section
			aria-label={m.cron_next_runs()}
			className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm"
		>
			<h2 className="text-sm font-medium">{m.cron_next_runs()}</h2>

			<ChoiceGroup
				legend={m.cron_show_times()}
				name="cron-zone"
				choices={zones()}
				value={zone}
				onChange={onZoneChange}
				columns="sm:grid-cols-2"
			/>

			{!schedule || !now ? (
				<Message>
					{schedule ? m.cron_working_out() : m.cron_fix_expression()}
				</Message>
			) : runs.length === 0 ? (
				<Message>{m.cron_never_runs()}</Message>
			) : (
				<ol className="flex flex-col divide-y">
					{runs.map((run) => (
						<li
							key={run.getTime()}
							className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
						>
							<time dateTime={run.toISOString()} className="font-mono text-sm">
								{formatRun(run, zone)}
							</time>
							<span className="shrink-0 text-xs text-muted-foreground">
								{relativeTime(now, run)}
							</span>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
