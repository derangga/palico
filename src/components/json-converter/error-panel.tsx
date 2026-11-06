import { Match, Predicate } from "effect";
import { CircleAlert } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import type { RunError } from "#/lib/json-converter/client.ts";
import { m } from "#/paraglide/messages.js";

import { FORMAT_NAME } from "./formats.ts";

/**
 * Replaces the output when the input cannot be converted. It says what is wrong
 * and where, and the input keeps its text so it can be fixed in place.
 */
export function ErrorPanel({
	error,
	id,
	detected,
	detectedFormat,
	onGoToLine,
}: {
	readonly error: RunError;
	readonly id: string;
	/** The format was guessed, so a wrong guess is the likely cause. */
	readonly detected: boolean;
	readonly detectedFormat: string;
	readonly onGoToLine: (line: number, column: number) => void;
}) {
	const title = Match.value(error).pipe(
		Match.tagsExhaustive({
			ParseError: ({ format }) =>
				m.jc_error_title_parse({ format: FORMAT_NAME[format] }),
			NotATableError: () => m.jc_error_title_shape(),
			InputTooLargeError: () => m.jc_error_title_large(),
			ConverterWorkerError: () => m.jc_error_title_worker(),
		}),
	);

	return (
		<div
			id={id}
			className="flex flex-col gap-3 rounded-md bg-destructive/10 p-4 text-sm"
		>
			<div className="flex items-start gap-2.5">
				<CircleAlert
					aria-hidden
					className="mt-0.5 size-5 shrink-0 text-destructive"
				/>
				<div className="flex min-w-0 flex-col gap-1">
					<p className="font-semibold">{title}</p>
					<p className="text-pretty break-words">{error.message}</p>
				</div>
			</div>

			{Predicate.isTagged(error, "ParseError") && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-7">
					<span className="font-mono text-[0.8125rem] font-semibold">
						{m.jc_error_location({ line: error.line, column: error.column })}
					</span>
					<Button
						variant="outline"
						size="sm"
						className="max-sm:h-11"
						onClick={() => onGoToLine(error.line, error.column)}
					>
						{m.jc_goto_line({ line: error.line })}
					</Button>
				</div>
			)}

			{Predicate.isTagged(error, "ParseError") && detected && (
				<p className="pl-7 text-muted-foreground">
					{m.jc_error_detected_hint({ format: detectedFormat })}
				</p>
			)}
		</div>
	);
}
