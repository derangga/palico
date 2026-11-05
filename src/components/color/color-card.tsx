import { Effect, Option } from "effect";
import { Check, CircleAlert, Copy, Pipette } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { useFlash } from "#/hooks/use-flash.ts";
import { copyText } from "#/lib/clipboard.ts";
import {
	eyeDropperSupported,
	pickFromScreen,
} from "#/lib/color/eye-dropper.ts";
import { COLOR_FORMATS, formatColor, toHex } from "#/lib/color/format.ts";
import type { Rgb } from "#/lib/color/oklab.ts";
import { toastOnExit } from "#/lib/exit-toast.ts";
import { cn } from "#/lib/utils.ts";

const FLASH_MS = 1800;

const INPUT_ID = "color-input";
const HINT_ID = "color-input-hint";

function FormatRow({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string;
}) {
	const [copied, flash] = useFlash(FLASH_MS);

	async function copy() {
		const exit = await Effect.runPromiseExit(copyText(value));

		if (Option.isSome(toastOnExit(exit, "Couldn't copy the color."))) flash();
	}

	return (
		<li>
			<button
				type="button"
				onClick={copy}
				aria-label={`Copy ${label} ${value}`}
				className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-[background-color,box-shadow,scale] duration-150 ease-out outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99] motion-reduce:active:scale-100"
			>
				<span className="w-14 shrink-0 text-xs font-semibold text-muted-foreground">
					{label}
				</span>
				<span className="min-w-0 flex-1 font-mono text-sm break-all">
					{value}
				</span>
				{/* A fixed-width slot, so "Copied" does not push the value around. */}
				<span className="flex w-20 shrink-0 items-center justify-end gap-1 text-xs">
					{copied ? (
						<>
							<Check aria-hidden className="size-3.5" />
							<span className="font-semibold">Copied</span>
						</>
					) : (
						<Copy aria-hidden className="size-3.5 text-muted-foreground" />
					)}
				</span>
			</button>
			<output className="sr-only">{copied ? `Copied ${value}` : ""}</output>
		</li>
	);
}

const noSubscription = () => () => {};

function EyeDropperButton({
	onPick,
}: {
	readonly onPick: (color: Rgb) => void;
}) {
	// False on the server and during hydration, then the real answer in the browser.
	const supported = useSyncExternalStore(
		noSubscription,
		eyeDropperSupported,
		() => false,
	);

	const controller = useRef<AbortController | null>(null);

	if (!supported) return null;

	async function open() {
		controller.current?.abort();

		const next = new AbortController();

		controller.current = next;

		const exit = await Effect.runPromiseExit(pickFromScreen(next.signal));

		if (next.signal.aborted) return;

		const picked = toastOnExit(exit, "Couldn't read a color from the screen.");

		if (Option.isSome(picked) && Option.isSome(picked.value)) {
			onPick(picked.value.value);
		}
	}

	return (
		<Button type="button" variant="outline" onClick={open}>
			<Pipette />
			Pick from screen
		</Button>
	);
}

/**
 * The current color: a swatch, a box to type one into, and its value in every
 * format. The text is a draft while someone types, so typing never rewrites it.
 */
export function ColorCard({
	color,
	text,
	invalid,
	onTextChange,
	onTextCommit,
	onScreenPick,
}: {
	readonly color: Rgb;
	/** What the box shows. Either the person's own typing or the color as HEX. */
	readonly text: string;
	readonly invalid: boolean;
	readonly onTextChange: (text: string) => void;
	readonly onTextCommit: () => void;
	readonly onScreenPick: (color: Rgb) => void;
}) {
	return (
		<section
			aria-label="Current color"
			className="animate-pop-in flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
		>
			<div
				aria-hidden
				className="h-28 w-full rounded-lg border border-input"
				style={{ backgroundColor: toHex(color) }}
			/>

			<div className="flex flex-col gap-2">
				<label htmlFor={INPUT_ID} className="text-sm font-medium">
					Color
				</label>
				<div className="flex flex-col gap-2 sm:flex-row">
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
					<EyeDropperButton onPick={onScreenPick} />
				</div>
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
					{invalid
						? "That isn't a color this reads. Try #8839ef, rgb(136 57 239), hsl(266 85% 58%) or oklch(0.54 0.24 293)."
						: "Type a HEX, RGB, HSL or OKLCH value, or pick one below. Click a row to copy it."}
				</p>
			</div>

			<ul className="-mx-2 flex flex-col">
				{COLOR_FORMATS.map(({ value, label }) => (
					<FormatRow
						key={value}
						label={label}
						value={formatColor(color, value)}
					/>
				))}
			</ul>
		</section>
	);
}
