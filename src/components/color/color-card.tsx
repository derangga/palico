import { Effect, Option } from "effect";
import { Check, CircleAlert, Copy } from "lucide-react";

import { Input } from "#/components/ui/input.tsx";
import { useFlash } from "#/hooks/use-flash.ts";
import { copyText } from "#/lib/clipboard.ts";
import { COLOR_FORMATS, formatColor, toHex } from "#/lib/color/format.ts";
import type { Rgb } from "#/lib/color/oklab.ts";
import { toastOnExit } from "#/lib/exit-toast.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

const FLASH_MS = 1800;

const INPUT_ID = "color-input";
const HINT_ID = "color-input-hint";

// HEX is the headline, so the rows list the other formats.
const OTHER_FORMATS = COLOR_FORMATS.filter(({ value }) => value !== "hex");

/** Copies `value` and says so for FLASH_MS. A failed copy shows a toast and says nothing. */
function useCopy(value: string): readonly [boolean, () => Promise<void>] {
	const [copied, flash] = useFlash(FLASH_MS);

	async function copy() {
		const exit = await Effect.runPromiseExit(copyText(value));

		if (Option.isSome(toastOnExit(exit, m.color_copy_failed()))) flash();
	}

	return [copied, copy];
}

const PRESSABLE =
	"transition-[background-color,box-shadow,scale] duration-150 ease-out outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99] motion-reduce:active:scale-100";

function HexHeadline({ value }: { readonly value: string }) {
	const [copied, copy] = useCopy(value);

	return (
		<div>
			<button
				type="button"
				onClick={copy}
				aria-label={m.color_copy_hex_aria({ value })}
				className={cn(
					"-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-1.5 text-left",
					PRESSABLE,
				)}
			>
				<span className="min-w-0 flex-1 font-mono text-2xl font-bold">
					{value}
				</span>
				{/* A fixed-width slot, so "Copied" does not push the value around. */}
				<span className="flex w-16 shrink-0 items-center justify-end gap-1 text-xs">
					{copied ? (
						<>
							<Check aria-hidden className="size-3.5" />
							<span className="font-semibold">{m.copy_copied()}</span>
						</>
					) : (
						<Copy aria-hidden className="size-3.5 text-muted-foreground" />
					)}
				</span>
			</button>
			<output className="sr-only">
				{copied ? m.palette_copied_sr({ value }) : ""}
			</output>
		</div>
	);
}

function FormatRow({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string;
}) {
	const [copied, copy] = useCopy(value);

	return (
		<li>
			<button
				type="button"
				onClick={copy}
				aria-label={m.color_copy_format_aria({ label, value })}
				className={cn(
					"flex w-full items-center gap-3 rounded-md px-2 py-2 text-left",
					PRESSABLE,
				)}
			>
				<span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground">
					{label}
				</span>
				<span className="min-w-0 flex-1 font-mono text-sm break-all">
					{value}
				</span>
				<span className="flex w-16 shrink-0 items-center justify-end gap-1 text-xs">
					{copied ? (
						<>
							<Check aria-hidden className="size-3.5" />
							<span className="font-semibold">{m.copy_copied()}</span>
						</>
					) : (
						<Copy aria-hidden className="size-3.5 text-muted-foreground" />
					)}
				</span>
			</button>
			<output className="sr-only">
				{copied ? m.palette_copied_sr({ value }) : ""}
			</output>
		</li>
	);
}

/**
 * The current color: a swatch, its HEX as the headline, the other formats, and a
 * box to type one into. The text is a draft while someone types, so typing never
 * rewrites it.
 */
export function ColorCard({
	color,
	text,
	invalid,
	onTextChange,
	onTextCommit,
}: {
	readonly color: Rgb;
	/** What the box shows. Either the person's own typing or the color as HEX. */
	readonly text: string;
	readonly invalid: boolean;
	readonly onTextChange: (text: string) => void;
	readonly onTextCommit: () => void;
}) {
	return (
		<section
			aria-label={m.color_card_aria()}
			className="animate-pop-in flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm"
		>
			{/* No color transition: the swatch follows the pointer, and a fade would lag it. */}
			<div
				aria-hidden
				className="h-24 w-full rounded-lg border border-input"
				style={{ backgroundColor: toHex(color) }}
			/>

			<div>
				<HexHeadline value={toHex(color)} />

				<ul className="-mx-2 flex flex-col">
					{OTHER_FORMATS.map(({ value, label }) => (
						<FormatRow
							key={value}
							label={label}
							value={formatColor(color, value)}
						/>
					))}
				</ul>
			</div>

			<div className="flex flex-col gap-2">
				<label htmlFor={INPUT_ID} className="text-sm font-medium">
					{m.color_type_label()}
				</label>
				<Input
					id={INPUT_ID}
					value={text}
					onChange={(event) => onTextChange(event.target.value)}
					onBlur={onTextCommit}
					onKeyDown={(event) => {
						if (event.key === "Enter") onTextCommit();
					}}
					aria-invalid={invalid}
					aria-describedby={HINT_ID}
					spellCheck={false}
					autoComplete="off"
					autoCapitalize="off"
					className="font-mono"
				/>
				<p
					id={HINT_ID}
					aria-live="polite"
					className={cn(
						"flex gap-2 text-xs",
						invalid ? "text-foreground" : "text-muted-foreground",
					)}
				>
					{invalid && (
						<CircleAlert
							aria-hidden
							className="mt-px size-3.5 shrink-0 text-destructive"
						/>
					)}
					{invalid ? m.color_invalid() : m.color_type_hint()}
				</p>
			</div>
		</section>
	);
}
