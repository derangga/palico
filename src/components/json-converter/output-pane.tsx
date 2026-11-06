import { ArrowRightLeft, ChevronDown, Download, Minimize2 } from "lucide-react";
import { useId } from "react";

import { CopyTextButton } from "#/components/copy-text-button.tsx";
import { SegmentedControl } from "#/components/segmented-control.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import type { ConversionResult } from "#/hooks/use-json-conversion.ts";
import { currentLocale } from "#/lib/i18n/state.ts";
import {
	DELIMITERS,
	type Delimiter,
	FORMATS,
	type Format,
	INDENTS,
	type JsonIndent,
} from "#/lib/json-converter/types.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

import { ErrorPanel } from "./error-panel.tsx";
import { delimiterName, FORMAT_NAME } from "./formats.ts";

// A <pre> this long makes the page sluggish. Copy and Download still use the whole text.
const PREVIEW_CHARS = 200_000;

const indentName = (indent: JsonIndent): string => {
	switch (indent) {
		case "2":
			return m.jc_indent_2();
		case "4":
			return m.jc_indent_4();
		case "tab":
			return m.jc_indent_tab();
		case "min":
			return m.jc_indent_min();
	}
};

const BODY_HEIGHT = "h-72 md:h-[min(60vh,34rem)]";

export function OutputPane({
	empty,
	result,
	busy,
	target,
	onTarget,
	indent,
	onIndent,
	sortKeys,
	onSortKeys,
	outputDelimiter,
	onOutputDelimiter,
	collapsed,
	onCollapsedChange,
	onDownload,
	onExample,
	errorId,
	detected,
	detectedFormat,
	onGoToLine,
}: {
	/** There is no input yet. */
	readonly empty: boolean;
	readonly result: ConversionResult | undefined;
	readonly busy: boolean;
	readonly target: Format;
	readonly onTarget: (target: Format) => void;
	readonly indent: JsonIndent;
	readonly onIndent: (indent: JsonIndent) => void;
	readonly sortKeys: boolean;
	readonly onSortKeys: (on: boolean) => void;
	readonly outputDelimiter: Delimiter;
	readonly onOutputDelimiter: (delimiter: Delimiter) => void;
	/** Below 768px the options and result fold away so the keyboard never hides the input. */
	readonly collapsed: boolean;
	readonly onCollapsedChange: (collapsed: boolean) => void;
	readonly onDownload: (output: string) => void;
	readonly onExample: () => void;
	readonly errorId: string;
	readonly detected: boolean;
	readonly detectedFormat: string;
	readonly onGoToLine: (line: number, column: number) => void;
}) {
	const bodyId = useId();
	const sortId = useId();
	const output = !empty && result?.kind === "ok" ? result.output : undefined;
	const minified = target === "json" && indent === "min";

	return (
		<section
			aria-label={m.jc_output_title()}
			className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
		>
			<div className="flex min-h-9 items-center justify-between gap-2">
				<div className="flex items-center gap-1">
					<h2 className="text-sm font-semibold">{m.jc_output_title()}</h2>
					{/* Below 768px only: the output folds away so the keyboard never hides the input. */}
					<Button
						variant="ghost"
						size="icon"
						className="size-11 md:hidden"
						aria-expanded={!collapsed}
						aria-controls={bodyId}
						aria-label={collapsed ? m.jc_show_output() : m.jc_hide_output()}
						onClick={() => onCollapsedChange(!collapsed)}
					>
						<ChevronDown
							className={cn(
								"transition-transform duration-200 ease-out motion-reduce:transition-none",
								!collapsed && "rotate-180",
							)}
						/>
					</Button>
				</div>

				<div className="flex items-center gap-1.5">
					{output !== undefined && !busy && (
						<>
							<Button
								variant="outline"
								className="max-sm:size-11 max-sm:px-0"
								onClick={() => onDownload(output)}
							>
								<Download />
								<span className="max-sm:sr-only">{m.jc_download()}</span>
							</Button>
							<CopyTextButton
								label={m.jc_copy()}
								getText={() => output}
								copiedMessage={m.jc_copied_announce()}
								failureMessage={m.jc_copy_failed()}
								className="max-sm:h-11"
							/>
						</>
					)}
				</div>
			</div>

			<div
				id={bodyId}
				className={cn("flex flex-col gap-3", collapsed && "max-md:hidden")}
			>
				<SegmentedControl
					legend={m.jc_target_legend()}
					name="jc-target"
					value={target}
					onChange={onTarget}
					segments={FORMATS.map((format) => ({
						value: format,
						label: FORMAT_NAME[format],
					}))}
				/>

				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					{target === "json" && (
						<SegmentedControl
							legend={m.jc_indent_legend()}
							name="jc-indent"
							className="min-w-0 max-sm:w-full sm:flex-1"
							value={indent}
							onChange={onIndent}
							segments={INDENTS.map((option) => ({
								value: option,
								label: indentName(option),
							}))}
						/>
					)}
					{target === "csv" && (
						<SegmentedControl
							legend={m.jc_delimiter_legend()}
							name="jc-out-delimiter"
							className="min-w-0 max-sm:w-full sm:flex-1"
							value={outputDelimiter}
							onChange={onOutputDelimiter}
							segments={DELIMITERS.map((delimiter) => ({
								value: delimiter,
								label: delimiterName(delimiter),
							}))}
						/>
					)}

					<label
						htmlFor={sortId}
						className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium sm:min-h-9"
					>
						<Checkbox
							id={sortId}
							checked={sortKeys}
							onCheckedChange={onSortKeys}
						/>
						{m.jc_sort_keys()}
					</label>

					<Button
						variant="outline"
						aria-pressed={minified}
						className={cn(
							"max-sm:h-11",
							minified && "border-primary bg-primary/10",
						)}
						onClick={() => {
							onTarget("json");
							onIndent(minified ? "2" : "min");
						}}
					>
						<Minimize2 />
						{m.jc_minify()}
					</Button>
				</div>

				{empty ? (
					<div
						className={cn(
							"flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-input p-6 text-center",
							BODY_HEIGHT,
						)}
					>
						<ArrowRightLeft
							aria-hidden
							className="size-8 text-muted-foreground"
						/>
						<div className="flex max-w-xs flex-col gap-1">
							<p className="text-sm font-semibold">{m.jc_empty_title()}</p>
							<p className="text-sm text-pretty text-muted-foreground">
								{m.jc_empty_body()}
							</p>
						</div>
						<Button
							variant="outline"
							className="max-sm:h-11"
							onClick={onExample}
						>
							{m.jc_try_example()}
						</Button>
					</div>
				) : result?.kind === "error" ? (
					<ErrorPanel
						error={result.error}
						id={errorId}
						detected={detected}
						detectedFormat={detectedFormat}
						onGoToLine={onGoToLine}
					/>
				) : output !== undefined ? (
					<div className="flex flex-col gap-2">
						<section
							// oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region has to be reachable by keyboard.
							tabIndex={0}
							aria-label={m.jc_output_aria()}
							aria-busy={busy}
							className={cn(
								"overflow-auto rounded-md border border-input bg-background p-3 transition-opacity duration-150 ease-out outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
								BODY_HEIGHT,
								busy && "opacity-60",
							)}
						>
							<pre className="font-mono text-base whitespace-pre md:text-sm">
								{output.length > PREVIEW_CHARS
									? output.slice(0, PREVIEW_CHARS)
									: output}
							</pre>
						</section>
						{output.length > PREVIEW_CHARS && (
							<p className="text-xs text-muted-foreground">
								{m.jc_truncated({
									shown: PREVIEW_CHARS.toLocaleString(currentLocale()),
									total: output.length.toLocaleString(currentLocale()),
								})}
							</p>
						)}
					</div>
				) : (
					<output
						className={cn(
							"flex items-center justify-center text-sm text-muted-foreground",
							BODY_HEIGHT,
						)}
					>
						{m.jc_working()}
					</output>
				)}
			</div>
		</section>
	);
}
