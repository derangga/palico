import { ChoiceGroup } from "#/components/choice-group.tsx";
import { CopyTextButton } from "#/components/copy-text-button.tsx";
import {
	COLOR_FORMATS,
	type ColorFormat,
	toCssVariables,
	toHex,
} from "#/lib/color/format.ts";
import type { Rgb } from "#/lib/color/oklab.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

const FORMAT_CHOICES = COLOR_FORMATS.map(({ value, label }) => ({
	value,
	label,
}));

/** The colors picked this visit. Click one to bring it back; copy them all as CSS. */
export function PickedTray({
	picked,
	current,
	format,
	onFormatChange,
	onUse,
}: {
	readonly picked: ReadonlyArray<Rgb>;
	readonly current: Rgb;
	readonly format: ColorFormat;
	readonly onFormatChange: (format: ColorFormat) => void;
	readonly onUse: (color: Rgb) => void;
}) {
	return (
		<section
			aria-label={m.color_picked_aria()}
			className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm"
		>
			<h2 className="text-sm font-medium">{m.color_picked_title()}</h2>

			{picked.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					{m.color_picked_empty()}
				</p>
			) : (
				<>
					<ul className="flex flex-wrap gap-2">
						{picked.map((color) => (
							<li key={toHex(color)} className="animate-pop-in">
								<button
									type="button"
									onClick={() => onUse(color)}
									aria-label={m.color_picked_use({ color: toHex(color) })}
									aria-pressed={toHex(color) === toHex(current)}
									className={cn(
										"size-10 rounded-md border border-input transition-[box-shadow,scale] duration-150 ease-out active:scale-[0.95] motion-reduce:active:scale-100",
										// A ring as well as a fill, so the current color never rests on color alone.
										"aria-pressed:ring-2 aria-pressed:ring-foreground aria-pressed:ring-offset-2 aria-pressed:ring-offset-card",
										// Focus is an outline, so it shows on a swatch that already has the ring.
										"focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
									)}
									style={{ backgroundColor: toHex(color) }}
								/>
							</li>
						))}
					</ul>

					<ChoiceGroup
						legend={m.color_css_format()}
						columns="grid-cols-2"
						name="picked-format"
						choices={FORMAT_CHOICES}
						value={format}
						onChange={onFormatChange}
					/>

					<div>
						<CopyTextButton
							label={m.palette_copy_css()}
							getText={() => toCssVariables(picked, format)}
							copiedMessage={m.palette_copy_css_done()}
							failureMessage={m.palette_copy_css_failed()}
						/>
					</div>
				</>
			)}
		</section>
	);
}
