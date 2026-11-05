import { CircleAlert, Pencil, SlidersHorizontal } from "lucide-react";

import { CopyTextButton } from "#/components/copy-text-button.tsx";
import { Button } from "#/components/ui/button.tsx";
import type { CronSyntaxError } from "#/lib/cron/errors.ts";
import { FIELD_LABELS } from "#/lib/cron/field-labels.ts";
import { FIELD_NAMES, splitFields } from "#/lib/cron/schedule.ts";
import { cn } from "#/lib/utils.ts";

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
			aria-label="Result"
			className="animate-pop-in flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
		>
			<p
				id={STATUS_ID}
				aria-live="polite"
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

			<dl
				aria-label="Expression, one cell per field"
				className="grid grid-cols-5 gap-1.5"
			>
				{FIELD_NAMES.map((name, index) => {
					const token = tokens[index];
					const invalid = error?.field === name;

					return (
						<div
							key={name}
							aria-current={activeField === index ? "true" : undefined}
							className={cn(
								"flex min-w-0 flex-col-reverse items-center gap-0.5 rounded-md border bg-background px-0.5 pt-2 pb-1.5",
								activeField === index && "border-primary ring-1 ring-primary",
								invalid &&
									"border-destructive bg-destructive/10 ring-1 ring-destructive",
							)}
						>
							<dt className="text-[0.6875rem] font-semibold text-muted-foreground">
								{FIELD_LABELS[name].label}
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
						label="Copy"
						getText={() => expression.trim()}
						copiedMessage={`Copied ${expression.trim()}`}
						failureMessage="Couldn't copy the expression."
						className="h-11 flex-1 sm:h-9 sm:flex-none"
					/>
				)}
				<Button
					variant="outline"
					onClick={onToggleEditing}
					className="h-11 sm:h-9"
				>
					{editing ? <SlidersHorizontal /> : <Pencil />}
					{editing ? "Use builder" : "Edit as text"}
				</Button>
			</div>
		</section>
	);
}
