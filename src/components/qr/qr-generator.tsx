import { Cause, Effect, Exit, Option } from "effect";
import {
	Check,
	Copy,
	Download,
	FileImage,
	Loader2,
	QrCode,
	RotateCcw,
	TriangleAlert,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ChoiceGroup } from "#/components/choice-group.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { AdviceList, ScanTips } from "#/components/qr/guidance-panels.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { toastOnExit } from "#/lib/exit-toast.ts";
import { currentLocale } from "#/lib/i18n/state.ts";
import {
	ClipboardWriteError,
	FileDownloadError,
} from "#/lib/markdown/errors.ts";
import { encodeQr, type QrCode as QrSymbol } from "#/lib/qr/encode.ts";
import type { QrRenderError } from "#/lib/qr/errors.ts";
import {
	adviseOn,
	ECC_OPTIONS,
	minPrintWidthCm,
	planFor,
} from "#/lib/qr/guidance.ts";
import {
	copyPng,
	type QrStyle,
	saveBlob,
	svgDataUrl,
	toPng,
	toSvg,
} from "#/lib/qr/render.ts";
import type { EccLevel } from "#/lib/qr/tables.ts";
import { unitLabel } from "#/lib/qr/units.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

const DEFAULT_FOREGROUND = "#000000";
const DEFAULT_BACKGROUND = "#ffffff";

type PngSize = "512" | "1024" | "2048";

const pngSizes = () =>
	[
		{ value: "512", label: m.qrgen_size_small(), detail: "512 px" },
		{ value: "1024", label: m.qrgen_size_medium(), detail: "1024 px" },
		{ value: "2048", label: m.qrgen_size_large(), detail: "2048 px" },
	] as const;

type ExportKind = "png" | "svg" | "copy";

const successText = (kind: ExportKind): string => {
	switch (kind) {
		case "png":
			return m.qrgen_png_saved();
		case "svg":
			return m.qrgen_svg_saved();
		case "copy":
			return m.qrgen_image_copied();
	}
};

const FLASH_MS = 1800;

type ExportError = FileDownloadError | ClipboardWriteError | QrRenderError;

function exportProgram(
	kind: ExportKind,
	qr: QrSymbol,
	style: QrStyle,
	pngPixels: number,
): Effect.Effect<void, ExportError> {
	switch (kind) {
		case "svg":
			return saveBlob(
				new Blob([toSvg(qr, style)], { type: "image/svg+xml" }),
				"qr-code.svg",
			);
		case "png":
			return toPng(qr, style, pngPixels).pipe(
				Effect.flatMap((blob) => saveBlob(blob, "qr-code.png")),
			);
		case "copy":
			return toPng(qr, style, 1024).pipe(Effect.flatMap(copyPng));
	}
}

function ColorField({
	label,
	value,
	onChange,
}: {
	readonly label: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
}) {
	return (
		<label className="flex flex-col gap-1.5 text-sm font-medium">
			{label}
			<span className="flex items-center gap-2">
				<input
					type="color"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
				/>
				<span className="font-mono text-xs font-normal text-muted-foreground">
					{value.toUpperCase()}
				</span>
			</span>
		</label>
	);
}

function ExportButton({
	kind,
	busy,
	done,
	icon,
	label,
	doneLabel,
	variant,
	onClick,
}: {
	readonly kind: ExportKind;
	readonly busy: ExportKind | null;
	readonly done: ExportKind | null;
	readonly icon: React.ReactNode;
	readonly label: string;
	readonly doneLabel: string;
	readonly variant: "default" | "outline";
	readonly onClick: (kind: ExportKind) => void;
}) {
	const working = busy === kind;
	const finished = done === kind;

	return (
		<Button
			variant={variant}
			// aria-disabled, not disabled: a disabled button drops keyboard focus
			// the moment it is pressed. The handler ignores clicks while busy.
			aria-disabled={busy !== null || undefined}
			onClick={() => onClick(kind)}
			className="min-w-0 flex-1 basis-full aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:basis-0"
		>
			{working ? (
				<Loader2 className="animate-spin" />
			) : finished ? (
				<Check />
			) : (
				icon
			)}
			{working ? m.qrgen_working() : finished ? doneLabel : label}
		</Button>
	);
}

export function QrGenerator() {
	const [text, setText] = useState("");
	const [ecc, setEcc] = useState<EccLevel>("M");
	const [foreground, setForeground] = useState(DEFAULT_FOREGROUND);
	const [background, setBackground] = useState(DEFAULT_BACKGROUND);
	const [pngSize, setPngSize] = useState<PngSize>("1024");
	const [busy, setBusy] = useState<ExportKind | null>(null);
	const [done, setDone] = useState<ExportKind | null>(null);
	const flashTimer = useRef<number | undefined>(undefined);

	// Typing stays instant. The code redraws from the deferred text, so a large
	// code never holds up a keystroke, and the preview dims while it catches up.
	const deferredText = useDeferredValue(text);
	const catchingUp = text !== deferredText;

	const result = useMemo(
		() =>
			deferredText === ""
				? undefined
				: Effect.runSyncExit(encodeQr(deferredText, ecc)),
		[deferredText, ecc],
	);

	const qr = result && Exit.isSuccess(result) ? result.value : undefined;

	const style = useMemo(
		() => ({ foreground, background }),
		[foreground, background],
	);

	const svg = useMemo(() => (qr ? toSvg(qr, style) : undefined), [qr, style]);
	const plan = planFor(text, ecc);
	const advice = adviseOn({ text, ecc, foreground, background });
	const tooLong = text !== "" && plan.version === undefined;

	const colorsChanged =
		foreground !== DEFAULT_FOREGROUND || background !== DEFAULT_BACKGROUND;

	const eccOption = ECC_OPTIONS.find((option) => option.level === ecc);
	const fill = plan.limit === 0 ? 0 : Math.min(1, plan.length / plan.limit);

	useEffect(() => () => window.clearTimeout(flashTimer.current), []);

	async function exportAs(kind: ExportKind) {
		if (!qr || busy !== null) return;

		setBusy(kind);
		setDone(null);
		window.clearTimeout(flashTimer.current);

		const exit = await Effect.runPromiseExit(
			exportProgram(kind, qr, style, Number(pngSize)),
		);

		setBusy(null);

		if (Option.isSome(toastOnExit(exit, m.qrgen_export_failed()))) {
			recordToolUse("/qr-generator");
			toast.success(successText(kind));
			setDone(kind);
			flashTimer.current = window.setTimeout(() => setDone(null), FLASH_MS);
		}
	}

	const failure =
		result && Exit.isFailure(result)
			? Option.getOrUndefined(Cause.findErrorOption(result.cause))
			: undefined;

	return (
		<PageShell width="wide">
			<PageHeader title={m.tool_qr_generator_label()}>
				{m.qrgen_description()}
			</PageHeader>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
				<section
					aria-label={m.qrgen_settings_aria()}
					className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
				>
					<div>
						<label htmlFor="qr-text" className="mb-2 block text-sm font-medium">
							{m.qrgen_text_label()}
						</label>
						<Textarea
							id="qr-text"
							value={text}
							onChange={(event) => setText(event.target.value)}
							placeholder="https://example.com"
							rows={3}
							spellCheck={false}
							autoComplete="off"
							autoCapitalize="none"
							aria-invalid={tooLong || undefined}
							aria-describedby="qr-meter-label"
							className="max-h-64 min-h-24 resize-y"
						/>
						<div
							id="qr-meter-label"
							className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"
						>
							<span>
								{m.qrgen_length({
									count: plan.length.toLocaleString(currentLocale()),
									unit: unitLabel(plan.unit),
								})}
								{plan.modules !== undefined && (
									<> · {m.qrgen_modules({ size: plan.modules })}</>
								)}
							</span>
							<span>
								{m.qrgen_up_to({
									limit: plan.limit.toLocaleString(currentLocale()),
								})}
							</span>
						</div>
						<div
							// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a styled bar whose fill animates by transform; the native <meter> cannot do that.
							role="meter"
							aria-label={m.qrgen_meter_aria()}
							aria-valuemin={0}
							aria-valuemax={plan.limit}
							aria-valuenow={Math.min(plan.length, plan.limit)}
							className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary"
						>
							<div
								className={cn(
									"h-full origin-left rounded-full transition-[transform,background-color] duration-150 ease-out motion-reduce:transition-none",
									tooLong ? "bg-destructive" : "bg-cat-file",
								)}
								style={{ transform: `scaleX(${fill})` }}
							/>
						</div>
					</div>

					<AdviceList advice={advice} />

					<div>
						<ChoiceGroup
							legend={m.qrgen_ecc_legend()}
							name="qr-ecc"
							value={ecc}
							onChange={setEcc}
							choices={ECC_OPTIONS.map((option) => ({
								value: option.level,
								label: option.label,
								detail: m.qrgen_repairs({ percent: option.recovers }),
							}))}
						/>
						<p className="mt-2 text-xs text-muted-foreground">
							{eccOption?.hint} {m.qrgen_ecc_note()}
						</p>
					</div>

					<div className="flex flex-wrap items-end gap-x-6 gap-y-3">
						<ColorField
							label={m.qrgen_color_code()}
							value={foreground}
							onChange={setForeground}
						/>
						<ColorField
							label={m.qrgen_color_background()}
							value={background}
							onChange={setBackground}
						/>
						{colorsChanged && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setForeground(DEFAULT_FOREGROUND);
									setBackground(DEFAULT_BACKGROUND);
								}}
							>
								<RotateCcw />
								{m.qrgen_reset_colors()}
							</Button>
						)}
					</div>

					<ScanTips />
				</section>

				<section
					aria-label={m.qrgen_your_code_aria()}
					className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6 lg:sticky lg:top-20"
				>
					{qr && svg ? (
						<div className="flex flex-col gap-4">
							<div
								className={cn(
									"mx-auto aspect-square w-full max-w-72 overflow-hidden rounded-lg border transition-opacity duration-150 ease-out",
									catchingUp && "opacity-50",
								)}
								aria-busy={catchingUp}
							>
								<img
									src={svgDataUrl(svg)}
									alt={m.qrgen_alt({
										text:
											deferredText.length > 60
												? `${deferredText.slice(0, 60)}…`
												: deferredText,
									})}
									className="size-full"
									draggable={false}
								/>
							</div>
							<p className="text-center text-xs text-muted-foreground">
								{m.qrgen_version({
									version: qr.version,
									size: qr.size,
									cm: minPrintWidthCm(qr.size),
								})}
							</p>
							<ChoiceGroup
								legend={m.qrgen_png_size()}
								name="qr-png-size"
								value={pngSize}
								onChange={setPngSize}
								columns="grid-cols-3 sm:grid-cols-3"
								choices={pngSizes()}
							/>
							<div className="flex flex-wrap gap-2">
								<ExportButton
									kind="png"
									busy={busy}
									done={done}
									variant="default"
									icon={<Download />}
									label={m.qrgen_save_png()}
									doneLabel={m.qrgen_saved()}
									onClick={exportAs}
								/>
								<ExportButton
									kind="svg"
									busy={busy}
									done={done}
									variant="outline"
									icon={<FileImage />}
									label={m.qrgen_save_svg()}
									doneLabel={m.qrgen_saved()}
									onClick={exportAs}
								/>
								<ExportButton
									kind="copy"
									busy={busy}
									done={done}
									variant="outline"
									icon={<Copy />}
									label={m.qrgen_copy_image()}
									doneLabel={m.copy_copied()}
									onClick={exportAs}
								/>
							</div>
						</div>
					) : failure ? (
						<Empty className="border-0 p-2">
							<EmptyHeader>
								<EmptyMedia
									variant="icon"
									className="bg-destructive/15 text-destructive"
								>
									<TriangleAlert />
								</EmptyMedia>
								<EmptyTitle>{m.qrgen_wont_fit_title()}</EmptyTitle>
								<EmptyDescription>{m.qrgen_wont_fit()}</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<Empty className="border-0 p-2">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<QrCode />
								</EmptyMedia>
								<EmptyTitle>{m.qrgen_empty_title()}</EmptyTitle>
								<EmptyDescription>{m.qrgen_empty()}</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</section>
			</div>
		</PageShell>
	);
}
