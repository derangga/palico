import { CircleAlert, Pencil, SlidersHorizontal } from "lucide-react";

import { CopyTextButton } from "#/components/copy-text-button.tsx";
import { Button } from "#/components/ui/button.tsx";
import type { CronSyntaxError } from "#/lib/cron/errors.ts";
import { fieldLabels } from "#/lib/cron/field-labels.ts";
import { FIELD_NAMES, splitFields } from "#/lib/cron/schedule.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

export const STATUS_ID = "cron-status";

/**
 * The answer: the schedule in plain English, the expression as five labelled
 * cells, and the copy button. The cells only show the expression. Editing
 * happens in the builder or the text editor, never here.
 */
export function ScheduleReadout({
	expression,
	sentence,
	error,
	activeField,
	editing,
	onToggleEditing,
}: {
	readonly expression: string;
	/** Undefined when the expression is invalid. */
	readonly sentence: string | undefined;
	readonly error: CronSyntaxError | undefined;
	/** The field the text caret is in, so its cell can be marked. */
	readonly activeField: number | undefined;
	readonly editing: boolean;
	readonly onToggleEditing: () => void;
}) {
	const tokens = splitFields(expression);

	return (
		<section
			aria-label={m.cron_result_aria()}
			className="animate-pop-in flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
		>
			<p
				id={STATUS_ID}
				// An error changes on almost every keystroke while typing, so only a good sentence is announced.
				aria-live={error ? "off" : "polite"}
				className={cn(
					"min-h-7 text-balance",
					sentence
						? "text-xl font-extrabold sm:text-2xl"
						: "flex gap-2 text-sm font-medium",
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

			<dl className="grid grid-cols-5 gap-1.5">
				{FIELD_NAMES.map((name, index) => {
					const token = tokens[index];
					const invalid = error?.field === name;

					return (
						<div
							key={name}
							className={cn(
								"flex min-w-0 flex-col-reverse items-center gap-0.5 rounded-md border bg-background px-0.5 pt-2 pb-1.5",
								activeField === index && "border-primary ring-1 ring-primary",
								invalid &&
									"border-destructive bg-destructive/10 ring-1 ring-destructive",
							)}
						>
							<dt className="text-xs font-semibold text-muted-foreground">
								{fieldLabels(name).label}
							</dt>
							<dd className="max-w-full truncate px-0.5 font-mono text-base font-medium sm:text-lg">
								{token || "·"}
							</dd>
						</div>
					);
				})}
			</dl>

			<div className="flex flex-col gap-2 sm:flex-row">
				{!error && (
					<CopyTextButton
						label={m.cron_copy()}
						getText={() => expression.trim()}
						copiedMessage={m.cron_copied({ expression: expression.trim() })}
						failureMessage={m.cron_copy_failed()}
						className="h-11 sm:h-9"
					/>
				)}
				<Button
					variant="outline"
					onClick={onToggleEditing}
					className="h-11 sm:h-9"
				>
					{editing ? <SlidersHorizontal /> : <Pencil />}
					{editing ? m.cron_use_builder() : m.cron_edit_text()}
				</Button>
			</div>
		</section>
	);
}
