import { Predicate } from "effect";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { useJsonConversion } from "#/hooks/use-json-conversion.ts";
import { currentLocale } from "#/lib/i18n/state.ts";
import { detectDelimiter } from "#/lib/json-converter/csv.ts";
import { detectFormat, formatOfFileName } from "#/lib/json-converter/detect.ts";
import { offsetAt } from "#/lib/json-converter/position.ts";
import {
	type Delimiter,
	type Format,
	type JsonIndent,
	MAX_INPUT_CHARS,
	megabytes,
} from "#/lib/json-converter/types.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { m } from "#/paraglide/messages.js";

import {
	defaultTarget,
	EXAMPLE,
	FILE_EXTENSION,
	FORMAT_NAME,
	MIME_TYPE,
} from "./formats.ts";
import { InputPane } from "./input-pane.tsx";
import { OutputPane } from "./output-pane.tsx";

const BOM = /^﻿/;

function downloadText(text: string, name: string, type: string) {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const link = document.createElement("a");

	link.href = url;
	link.download = name;
	link.click();
	URL.revokeObjectURL(url);
}

export function JsonConverter() {
	const [text, setText] = useState("");
	// What the loaded file's extension says. Typing drops it, and content takes over.
	const [fileHint, setFileHint] = useState<Format | undefined>();
	const [fileName, setFileName] = useState<string | undefined>();

	const [sourceChoice, setSourceChoice] = useState<Format | "auto">("auto");

	const [delimiterChoice, setDelimiterChoice] = useState<Delimiter | "auto">(
		"auto",
	);

	const [guessTypes, setGuessTypes] = useState(false);

	// Until the person picks a target, it follows the source: JSON becomes YAML
	// and the other two become JSON.
	const [targetChoice, setTargetChoice] = useState<Format | undefined>();
	const [indent, setIndent] = useState<JsonIndent>("2");
	const [sortKeys, setSortKeys] = useState(false);
	const [outputDelimiter, setOutputDelimiter] = useState<Delimiter>(",");
	const [collapsed, setCollapsed] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const errorId = useId();

	const detected = fileHint ?? detectFormat(text);
	const source = sourceChoice === "auto" ? detected : sourceChoice;
	const target = targetChoice ?? defaultTarget(source);
	const empty = text.trim() === "";

	const { result, busy } = useJsonConversion(text, {
		source,
		target,
		indent,
		sortKeys,
		guessTypes,
		inputDelimiter:
			delimiterChoice === "auto" ? detectDelimiter(text) : delimiterChoice,
		outputDelimiter,
		locale: currentLocale(),
	});

	const parseFailed =
		!empty &&
		result?.kind === "error" &&
		Predicate.isTagged(result.error, "ParseError");

	function edit(next: string) {
		setText(next);
		setFileHint(undefined);

		// Emptied and pasted over: the old file's name no longer fits.
		if (next === "") setFileName(undefined);
	}

	async function openFile(file: File) {
		// A character can take up to three bytes, so only a file this big is surely too long.
		// The converter checks the exact character count.
		if (file.size > MAX_INPUT_CHARS * 3) {
			toast.error(
				m.jc_err_too_large({
					size: megabytes(file.size),
					limit: megabytes(MAX_INPUT_CHARS),
				}),
			);

			return;
		}

		try {
			const content = (await file.text()).replace(BOM, "");

			setText(content);
			setFileHint(formatOfFileName(file.name));
			setFileName(file.name);
			// A new file starts from what it says it is.
			setSourceChoice("auto");
		} catch {
			toast.error(m.jc_file_read_failed());
		}
	}

	function clear() {
		setText("");
		setFileHint(undefined);
		setFileName(undefined);
		textareaRef.current?.focus();
	}

	function goToLine(line: number, column: number) {
		const field = textareaRef.current;

		if (!field) return;

		const offset = offsetAt(text, line, column);
		const lineHeight = Number.parseFloat(getComputedStyle(field).lineHeight);

		field.focus();
		field.setSelectionRange(offset, Math.min(offset + 1, text.length));

		// Setting the selection does not always scroll it into view, so bring the line to the middle.
		if (Number.isFinite(lineHeight)) {
			field.scrollTop = Math.max(
				0,
				(line - 1) * lineHeight - field.clientHeight / 2,
			);
		}
	}

	function download(output: string) {
		const base = fileName?.replace(/\.[^.]+$/, "") || "converted";

		// Excel reads a CSV without a byte order mark as Windows-1252 and garbles accents. Copy stays clean.
		const body = target === "csv" ? `\uFEFF${output}` : output;

		downloadText(body, `${base}.${FILE_EXTENSION[target]}`, MIME_TYPE[target]);
		recordToolUse("/json-converter");
	}

	return (
		<PageShell width="full">
			<PageHeader title={m.tool_json_converter_label()}>
				{m.jc_header_desc()}
			</PageHeader>

			<div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
				<InputPane
					text={text}
					onTextChange={edit}
					onFile={openFile}
					onClear={clear}
					textareaRef={textareaRef}
					sourceChoice={sourceChoice}
					onSourceChoice={setSourceChoice}
					source={source}
					delimiterChoice={delimiterChoice}
					onDelimiterChoice={setDelimiterChoice}
					guessTypes={guessTypes}
					onGuessTypes={setGuessTypes}
					invalid={parseFailed}
					describedBy={errorId}
				/>

				<OutputPane
					empty={empty}
					result={result}
					busy={busy}
					target={target}
					onTarget={setTargetChoice}
					indent={indent}
					onIndent={setIndent}
					sortKeys={sortKeys}
					onSortKeys={setSortKeys}
					outputDelimiter={outputDelimiter}
					onOutputDelimiter={setOutputDelimiter}
					collapsed={collapsed}
					onCollapsedChange={setCollapsed}
					onDownload={download}
					onExample={() => edit(EXAMPLE)}
					errorId={errorId}
					detected={sourceChoice === "auto"}
					detectedFormat={FORMAT_NAME[detected]}
					onGoToLine={goToLine}
				/>
			</div>
		</PageShell>
	);
}
