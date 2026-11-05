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
			aria-label="Picked colors"
			className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
		>
			<h2 className="text-sm font-medium">Picked colors</h2>

			{picked.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					Colors you pick appear here, newest first, so you can come back to
					them or copy them together.
				</p>
			) : (
				<>
					<ul className="flex flex-wrap gap-2">
						{picked.map((color) => (
							<li key={toHex(color)} className="animate-pop-in">
								<button
									type="button"
									onClick={() => onUse(color)}
									aria-label={`Use ${toHex(color)}`}
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
						legend="CSS format"
						name="picked-format"
						choices={FORMAT_CHOICES}
						value={format}
						onChange={onFormatChange}
					/>

					<div>
						<CopyTextButton
							label="Copy as CSS variables"
							getText={() => toCssVariables(picked, format)}
							copiedMessage="Copied the CSS variables."
							failureMessage="Couldn't copy the CSS."
						/>
					</div>
				</>
			)}
		</section>
	);
}
