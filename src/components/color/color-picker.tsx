import { useState } from "react";

import { ColorCard } from "#/components/color/color-card.tsx";
import { ImagePicker } from "#/components/color/image-picker.tsx";
import { PickedTray } from "#/components/color/picked-tray.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { type ColorFormat, toHex } from "#/lib/color/format.ts";
import type { Rgb } from "#/lib/color/oklab.ts";
import { isShortHex, parseColor } from "#/lib/color/parse.ts";
import { rememberColor } from "#/lib/color/picked.ts";

// Latte Mauve, so the page shows a real color and all four formats on arrival.
const STARTING_COLOR: Rgb = { r: 136, g: 57, b: 239 };

export function ColorPicker() {
	const [color, setColor] = useState<Rgb>(STARTING_COLOR);
	// What the person has typed. Null means the box shows the color as HEX.
	const [draft, setDraft] = useState<string | null>(null);
	const [picked, setPicked] = useState<ReadonlyArray<Rgb>>([]);
	const [cssFormat, setCssFormat] = useState<ColorFormat>("hex");

	const text = draft ?? toHex(color);

	// An empty box is not an error, only unfinished.
	const invalid =
		draft !== null && draft.trim() !== "" && parseColor(draft) === undefined;

	// A color from outside the box replaces whatever was typed.
	function choose(next: Rgb) {
		setColor(next);
		setDraft(null);
	}

	function keep(next: Rgb) {
		setPicked((current) => rememberColor(current, next));
	}

	function chooseAndKeep(next: Rgb) {
		choose(next);
		keep(next);
	}

	function changeText(next: string) {
		setDraft(next);

		const parsed = parseColor(next);

		// "#883" is a color, and also the start of "#8839ef". Applying it while
		// the person is still typing would flash a color they are not asking for.
		if (parsed && !isShortHex(next)) setColor(parsed);
	}

	// Enter or leaving the box settles it: a good value is used and kept, a bad one is dropped.
	function commitText() {
		if (draft === null) return;

		const parsed = parseColor(draft);

		if (parsed) {
			setColor(parsed);
			keep(parsed);
		} else {
			setDraft(null);
		}
	}

	return (
		<PageShell>
			<PageHeader title="Color Picker">
				Pick a color from an image or your screen, or type one in. Get it as
				HEX, RGB, HSL or OKLCH. Everything happens on your device.
			</PageHeader>

			<div className="flex flex-col gap-6">
				<ColorCard
					color={color}
					text={text}
					invalid={invalid}
					onTextChange={changeText}
					onTextCommit={commitText}
					onScreenPick={chooseAndKeep}
				/>

				<ImagePicker onPick={choose} onCommit={chooseAndKeep} />

				<PickedTray
					picked={picked}
					current={color}
					format={cssFormat}
					onFormatChange={setCssFormat}
					onUse={choose}
				/>
			</div>
		</PageShell>
	);
}
