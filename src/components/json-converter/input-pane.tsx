import { FolderOpen, X } from "lucide-react";
import { type DragEvent, type RefObject, useId, useRef, useState } from "react";

import { SegmentedControl } from "#/components/segmented-control.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
	DELIMITERS,
	type Delimiter,
	FORMATS,
	type Format,
} from "#/lib/json-converter/types.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

import { delimiterName, FORMAT_NAME } from "./formats.ts";

export const ACCEPT =
	".json,.yaml,.yml,.csv,.tsv,.txt,application/json,text/csv,text/plain,text/yaml";

const hasFiles = (event: DragEvent) =>
	event.dataTransfer.types.includes("Files");

export function InputPane({
	text,
	onTextChange,
	onFile,
	onClear,
	textareaRef,
	sourceChoice,
	onSourceChoice,
	source,
	delimiterChoice,
	onDelimiterChoice,
	guessTypes,
	onGuessTypes,
	invalid,
	describedBy,
}: {
	readonly text: string;
	readonly onTextChange: (text: string) => void;
	readonly onFile: (file: File) => void;
	readonly onClear: () => void;
	readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
	readonly sourceChoice: Format | "auto";
	readonly onSourceChoice: (choice: Format | "auto") => void;
	/** The format the text is read as, chosen or detected. */
	readonly source: Format;
	readonly delimiterChoice: Delimiter | "auto";
	readonly onDelimiterChoice: (choice: Delimiter | "auto") => void;
	readonly guessTypes: boolean;
	readonly onGuessTypes: (on: boolean) => void;
	readonly invalid: boolean;
	readonly describedBy: string | undefined;
}) {
	const [dragging, setDragging] = useState(false);
	const picker = useRef<HTMLInputElement>(null);
	const guessId = useId();

	return (
		// oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drop target. The Open file button is the keyboard and click equivalent.
		<section
			aria-label={m.jc_input_title()}
			data-dragging={dragging || undefined}
			className="relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-[border-color,box-shadow] duration-150 ease-out data-[dragging]:border-primary data-[dragging]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_22%,transparent)] sm:p-5"
			onDragEnter={(event) => {
				if (hasFiles(event)) setDragging(true);
			}}
			onDragOver={(event) => {
				if (!hasFiles(event)) return;

				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={(event) => {
				if (
					!(event.relatedTarget instanceof Node) ||
					!event.currentTarget.contains(event.relatedTarget)
				) {
					setDragging(false);
				}
			}}
			onDrop={(event) => {
				if (!hasFiles(event)) return;

				event.preventDefault();
				setDragging(false);

				const [file] = event.dataTransfer.files;

				if (file) onFile(file);
			}}
		>
			<div className="flex min-h-9 items-center justify-between gap-2">
				<h2 className="text-sm font-semibold">{m.jc_input_title()}</h2>
				<div className="flex items-center gap-1.5">
					{text !== "" && (
						<Button variant="ghost" className="max-sm:h-11" onClick={onClear}>
							<X />
							{m.common_clear()}
						</Button>
					)}
					<Button
						variant="outline"
						className="max-sm:h-11"
						onClick={() => picker.current?.click()}
					>
						<FolderOpen />
						{m.jc_open_file()}
					</Button>
					<input
						ref={picker}
						type="file"
						accept={ACCEPT}
						aria-label={m.jc_file_aria()}
						className="sr-only"
						tabIndex={-1}
						onChange={(event) => {
							const [file] = event.target.files ?? [];

							if (file) onFile(file);

							event.target.value = "";
						}}
					/>
				</div>
			</div>

			<SegmentedControl
				legend={m.jc_format_legend()}
				name="jc-source"
				value={sourceChoice}
				onChange={onSourceChoice}
				segments={[
					{ value: "auto", label: m.jc_format_auto() },
					...FORMATS.map((format) => ({
						value: format,
						label: FORMAT_NAME[format],
					})),
				]}
			/>

			<p className="min-h-5 text-xs text-muted-foreground">
				{text.trim() === ""
					? ""
					: sourceChoice === "auto"
						? m.jc_detected({ format: FORMAT_NAME[source] })
						: m.jc_reading_as({ format: FORMAT_NAME[source] })}
			</p>

			{source === "csv" && (
				<div className="flex flex-col gap-3 rounded-md bg-muted p-3">
					<SegmentedControl
						legend={m.jc_delimiter_legend()}
						name="jc-delimiter"
						value={delimiterChoice}
						onChange={onDelimiterChoice}
						segments={[
							{ value: "auto", label: m.jc_delimiter_auto() },
							...DELIMITERS.map((delimiter) => ({
								value: delimiter,
								label: delimiterName(delimiter),
							})),
						]}
					/>
					<label
						htmlFor={guessId}
						className="flex min-h-11 cursor-pointer items-start gap-2.5 sm:min-h-0"
					>
						<Checkbox
							id={guessId}
							checked={guessTypes}
							onCheckedChange={onGuessTypes}
							className="mt-0.5"
						/>
						<span className="flex flex-col">
							<span className="text-sm font-medium">{m.jc_guess_types()}</span>
							<span className="text-xs text-muted-foreground">
								{m.jc_guess_types_hint()}
							</span>
						</span>
					</label>
				</div>
			)}

			<Textarea
				ref={textareaRef}
				value={text}
				onChange={(event) => onTextChange(event.target.value)}
				placeholder={m.jc_input_placeholder()}
				aria-label={m.jc_input_aria()}
				aria-invalid={invalid || undefined}
				aria-describedby={invalid ? describedBy : undefined}
				spellCheck={false}
				autoCapitalize="off"
				autoCorrect="off"
				autoComplete="off"
				wrap="off"
				className="h-72 resize-none overflow-auto field-sizing-fixed font-mono whitespace-pre md:h-[min(60vh,34rem)]"
			/>

			<div
				aria-hidden
				className={cn(
					"pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-card/90 text-sm font-semibold opacity-0 transition-opacity duration-150 ease-out",
					dragging && "opacity-100",
				)}
			>
				{m.jc_drop_overlay()}
			</div>
		</section>
	);
}
