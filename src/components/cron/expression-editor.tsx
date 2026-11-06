import { useEffect, useRef } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { fieldAtCaret, FIELD_LABELS } from "#/lib/cron/field-labels.ts";
import { FIELD_NAMES } from "#/lib/cron/schedule.ts";

const INPUT_ID = "cron-expression";

// Symbols that are slow to find on a phone keyboard. Space moves to the next field.
const KEYS: ReadonlyArray<{
	readonly insert: string;
	readonly label: string;
	readonly accessibleName: string;
	readonly word?: boolean;
}> = [
	{ insert: "*", label: "*", accessibleName: "Insert *" },
	{ insert: ",", label: ",", accessibleName: "Insert a comma" },
	{ insert: "-", label: "-", accessibleName: "Insert a dash" },
	{ insert: "/", label: "/", accessibleName: "Insert a slash" },
	{ insert: " ", label: "space", accessibleName: "Insert a space", word: true },
];

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

/**
 * The one text box, shown only after "Edit as text". It sits where the builder
 * was, so a schedule is never edited in two places at once. The caret position
 * is reported so the readout can mark the field being typed.
 */
export function ExpressionEditor({
	value,
	invalid,
	describedBy,
	activeField,
	onChange,
	onSettle,
	onActiveFieldChange,
}: {
	readonly value: string;
	readonly invalid: boolean;
	readonly describedBy: string;
	readonly activeField: number | undefined;
	readonly onChange: (value: string) => void;
	/** Enter or leaving the box: a good expression is written out in full. */
	readonly onSettle: () => void;
	readonly onActiveFieldChange: (field: number | undefined) => void;
}) {
	const input = useRef<HTMLInputElement>(null);

	// The editor only mounts when someone asks for it, so move straight into it.
	useEffect(() => {
		const element = input.current;

		if (!element) return;

		element.focus();
		onActiveFieldChange(
			fieldAtCaret(element.value, element.selectionStart ?? 0),
		);
	}, [onActiveFieldChange]);

	function reportCaret() {
		const element = input.current;

		if (element && document.activeElement === element) {
			onActiveFieldChange(fieldAtCaret(value, element.selectionStart ?? 0));
		}
	}

	function insert(text: string) {
		const element = input.current;

		if (!element) return;

		element.focus();
		element.setRangeText(
			text,
			element.selectionStart ?? element.value.length,
			element.selectionEnd ?? element.value.length,
			"end",
		);
		onChange(element.value);
	}

	const activeName =
		activeField === undefined ? undefined : FIELD_NAMES[activeField];

	return (
		<div className="flex flex-col gap-3">
			<label htmlFor={INPUT_ID} className="sr-only">
				Cron expression
			</label>
			<Input
				ref={input}
				id={INPUT_ID}
				value={value}
				placeholder="0 9 * * 1-5"
				onChange={(event) => onChange(event.target.value)}
				onSelect={reportCaret}
				onKeyUp={reportCaret}
				onBlur={() => {
					onActiveFieldChange(undefined);
					onSettle();
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") onSettle();
				}}
				aria-invalid={invalid}
				aria-describedby={describedBy}
				spellCheck={false}
				autoComplete="off"
				autoCapitalize="off"
				autoCorrect="off"
				className="h-12 font-mono text-xl md:text-xl"
			/>

			<p className="min-h-5 text-xs text-muted-foreground">
				{activeName
					? `${FIELD_LABELS[activeName].name}: ${FIELD_LABELS[activeName].hint}`
					: "Five fields: minute, hour, day of month, month, day of week."}
			</p>

			{/* Keeps focus in the box, so the phone keyboard stays up between taps. */}
			<fieldset className="pointer-fine:hidden">
				<legend className="sr-only">Insert a symbol</legend>
				<div className="grid grid-cols-5 gap-2">
					{KEYS.map((key) => (
						<Button
							key={key.label}
							type="button"
							variant="outline"
							aria-label={key.accessibleName}
							onPointerDown={(event) => event.preventDefault()}
							onClick={() => insert(key.insert)}
							className="h-11 font-mono text-lg"
						>
							{key.word ? (
								<span className="font-sans text-sm font-semibold">
									{key.label}
								</span>
							) : (
								key.label
							)}
						</Button>
					))}
				</div>
			</fieldset>

			<details className="border-t pt-2 text-sm">
				<summary className="flex min-h-11 cursor-pointer sm:min-h-9 items-center font-semibold text-muted-foreground">
					What do the symbols mean?
				</summary>
				<dl className="mt-1 grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
					{SYNTAX.map(({ symbol, meaning, example }) => (
						<div key={symbol} className="contents">
							<dt className="font-mono font-semibold">{symbol}</dt>
							<dd className="text-muted-foreground">
								{meaning}. {example}.
							</dd>
						</div>
					))}
				</dl>
				<p className="mt-3 text-xs text-muted-foreground">
					When both day of month and day of week are set, the job runs on either
					one. Shortcuts like @daily and @hourly also work.
				</p>
			</details>
		</div>
	);
}
