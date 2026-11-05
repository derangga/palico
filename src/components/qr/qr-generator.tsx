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

import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { ChoiceGroup } from "#/components/qr/choice-group.tsx";
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
import { cn } from "#/lib/utils.ts";

const DEFAULT_FOREGROUND = "#000000";
const DEFAULT_BACKGROUND = "#ffffff";

type PngSize = "512" | "1024" | "2048";

const PNG_SIZES = [
	{ value: "512", label: "Small", detail: "512 px" },
	{ value: "1024", label: "Medium", detail: "1024 px" },
	{ value: "2048", label: "Large", detail: "2048 px" },
] as const;

type ExportKind = "png" | "svg" | "copy";

const SUCCESS_TEXT: Record<ExportKind, string> = {
	png: "PNG saved.",
	svg: "SVG saved.",
	copy: "Image copied.",
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
			{working ? "Working…" : finished ? doneLabel : label}
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

		if (Option.isSome(toastOnExit(exit, "Couldn't export the code."))) {
			toast.success(SUCCESS_TEXT[kind]);
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
			<PageHeader title="QR Code Generator">
				Type a link or some text and save the code as a PNG or SVG. It is made
				on your device, so what you type never leaves it.
			</PageHeader>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
				<section
					aria-label="Code settings"
					className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
				>
					<div>
						<label htmlFor="qr-text" className="mb-2 block text-sm font-medium">
							Text or link
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
								{plan.length.toLocaleString("en-US")} {plan.unit}
								{plan.modules !== undefined && (
									<>
										{" "}
										· {plan.modules}×{plan.modules} modules
									</>
								)}
							</span>
							<span>Up to {plan.limit.toLocaleString("en-US")}</span>
						</div>
						<div
							// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a styled bar whose fill animates by transform; the native <meter> cannot do that.
							role="meter"
							aria-label="How much of the code is used"
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
							legend="Error correction"
							name="qr-ecc"
							value={ecc}
							onChange={setEcc}
							choices={ECC_OPTIONS.map((option) => ({
								value: option.level,
								label: option.label,
								detail: `Repairs ${option.recovers}`,
							}))}
						/>
						<p className="mt-2 text-xs text-muted-foreground">
							{eccOption?.hint} Higher levels survive more damage but make the
							code bigger.
						</p>
					</div>

					<div className="flex flex-wrap items-end gap-x-6 gap-y-3">
						<ColorField
							label="Code color"
							value={foreground}
							onChange={setForeground}
						/>
						<ColorField
							label="Background"
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
								Reset colors
							</Button>
						)}
					</div>

					<ScanTips />
				</section>

				<section
					aria-label="Your code"
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
									alt={`QR code for ${deferredText.length > 60 ? `${deferredText.slice(0, 60)}…` : deferredText}`}
									className="size-full"
									draggable={false}
								/>
							</div>
							<p className="text-center text-xs text-muted-foreground">
								Version {qr.version} · {qr.size}×{qr.size} modules · print at
								least {minPrintWidthCm(qr.size)} cm wide
							</p>
							<ChoiceGroup
								legend="PNG size"
								name="qr-png-size"
								value={pngSize}
								onChange={setPngSize}
								columns="grid-cols-3 sm:grid-cols-3"
								choices={PNG_SIZES}
							/>
							<div className="flex flex-wrap gap-2">
								<ExportButton
									kind="png"
									busy={busy}
									done={done}
									variant="default"
									icon={<Download />}
									label="Save PNG"
									doneLabel="Saved"
									onClick={exportAs}
								/>
								<ExportButton
									kind="svg"
									busy={busy}
									done={done}
									variant="outline"
									icon={<FileImage />}
									label="Save SVG"
									doneLabel="Saved"
									onClick={exportAs}
								/>
								<ExportButton
									kind="copy"
									busy={busy}
									done={done}
									variant="outline"
									icon={<Copy />}
									label="Copy image"
									doneLabel="Copied"
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
								<EmptyTitle>This won't fit in a code</EmptyTitle>
								<EmptyDescription>
									Shorten the text or lower the error correction level. The
									message above has the exact limit.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<Empty className="border-0 p-2">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<QrCode />
								</EmptyMedia>
								<EmptyTitle>Your code appears here</EmptyTitle>
								<EmptyDescription>
									Start typing and it draws as you go. Then save it as a PNG or
									SVG.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</section>
			</div>
		</PageShell>
	);
}
