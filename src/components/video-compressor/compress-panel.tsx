import { Schema } from "effect";
import { Ban, Download, Film, Loader2, Minimize2 } from "lucide-react";
import { type Dispatch, useId } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs.tsx";
import {
	type CompressAction,
	type CompressState,
	type ModeVerdict,
	resolveMode,
} from "#/components/video-compressor/state.ts";
import { downloadBlob, formatBytes } from "#/components/video-cutter/utils.ts";
import { formatDecimal } from "#/lib/format-bytes.ts";
import {
	CompressQuality,
	isUnderTarget,
	QUALITY_OPTIONS,
	RESOLUTION_OPTIONS,
	Resolution,
	SIZE_PRESETS,
	SizeChoice,
} from "#/lib/video/compress-options.ts";
import { estimateMinutes } from "#/lib/video/limits.ts";
import { m } from "#/paraglide/messages.js";

const isSizeChoice = Schema.is(SizeChoice);
const isQuality = Schema.is(CompressQuality);
const isResolution = Schema.is(Resolution);

interface CompressPanelProps {
	file: File;
	state: CompressState;
	dispatch: Dispatch<CompressAction>;
	onCancel: () => void;
	onCompress: () => void;
}

export function CompressPanel({
	file,
	state,
	dispatch,
	onCancel,
	onCompress,
}: CompressPanelProps) {
	const sizeLabelId = useId();
	const qualityLabelId = useId();
	const resolutionLabelId = useId();
	const fieldMessageId = useId();

	const {
		tab,
		sizeChoice,
		customMB,
		quality,
		resolution,
		compressing,
		cancelling,
		percent,
		sizeError,
		output,
	} = state;

	const verdict: ModeVerdict = resolveMode(state, file);

	// The field's own message wins; the too-small message comes from a run.
	const fieldMessage =
		tab === "size"
			? verdict.kind === "invalid"
				? verdict.message
				: sizeError
			: null;

	const minutes = estimateMinutes(file.size, "mp4");

	let compressLabel = m.videocomp_compress();

	if (compressing)
		compressLabel =
			percent > 0
				? m.videocomp_compressing_percent({ percent })
				: m.videocomp_compressing();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
				<div className="flex items-center gap-3">
					<Film className="size-4 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium">{file.name}</p>
						<p className="text-xs text-muted-foreground">
							{formatBytes(file.size)}
						</p>
					</div>
				</div>

				<Tabs
					value={tab}
					onValueChange={(value) =>
						dispatch({
							type: "setTab",
							value: value === "quality" ? "quality" : "size",
						})
					}
				>
					<TabsList>
						<TabsTrigger value="size" disabled={compressing}>
							{m.videocomp_tab_size()}
						</TabsTrigger>
						<TabsTrigger value="quality" disabled={compressing}>
							{m.videocomp_tab_quality()}
						</TabsTrigger>
					</TabsList>
				</Tabs>

				<div className="flex flex-wrap items-start gap-4">
					{tab === "size" ? (
						<div className="flex flex-col gap-1.5">
							<span
								id={sizeLabelId}
								className="text-xs font-medium text-muted-foreground"
							>
								{m.videocomp_keep_under()}
							</span>
							<div className="flex items-center gap-2">
								<Select
									value={sizeChoice}
									onValueChange={(value) => {
										if (isSizeChoice(value))
											dispatch({ type: "setSizeChoice", value });
									}}
									disabled={compressing}
								>
									<SelectTrigger className="w-44" aria-labelledby={sizeLabelId}>
										<SelectValue>
											{() =>
												SIZE_PRESETS.find((p) => p.value === sizeChoice)
													?.label ?? m.videocomp_custom()
											}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{SIZE_PRESETS.map((p) => (
											<SelectItem
												key={p.value}
												value={p.value}
												disabled={isUnderTarget(file.size, p.mb)}
											>
												{p.label}
											</SelectItem>
										))}
										<SelectItem value="custom">
											{m.videocomp_custom()}
										</SelectItem>
									</SelectContent>
								</Select>
								{sizeChoice === "custom" && (
									<>
										<Input
											type="number"
											min={1}
											inputMode="decimal"
											className="w-24"
											value={customMB}
											disabled={compressing}
											aria-label={m.videocomp_target_aria()}
											aria-invalid={verdict.kind === "invalid"}
											aria-describedby={
												fieldMessage ? fieldMessageId : undefined
											}
											onChange={(e) =>
												dispatch({ type: "setCustomMB", value: e.target.value })
											}
										/>
										<span className="text-sm text-muted-foreground">MB</span>
									</>
								)}
							</div>
							{fieldMessage && (
								<p id={fieldMessageId} className="text-xs text-destructive">
									{fieldMessage}
								</p>
							)}
						</div>
					) : (
						<div className="flex flex-col gap-1.5">
							<span
								id={qualityLabelId}
								className="text-xs font-medium text-muted-foreground"
							>
								{m.videocomp_tab_quality()}
							</span>
							<Select
								value={quality}
								onValueChange={(value) => {
									if (isQuality(value)) dispatch({ type: "setQuality", value });
								}}
								disabled={compressing}
							>
								<SelectTrigger
									className="w-32"
									aria-labelledby={qualityLabelId}
								>
									<SelectValue>
										{() =>
											QUALITY_OPTIONS.find((o) => o.value === quality)?.label
										}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{QUALITY_OPTIONS.map((o) => (
										<SelectItem key={o.value} value={o.value}>
											{o.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="flex flex-col gap-1.5">
						<span
							id={resolutionLabelId}
							className="text-xs font-medium text-muted-foreground"
						>
							{m.videocomp_resolution()}
						</span>
						<Select
							value={resolution}
							onValueChange={(value) => {
								if (isResolution(value))
									dispatch({ type: "setResolution", value });
							}}
							disabled={compressing}
						>
							<SelectTrigger
								className="w-32"
								aria-labelledby={resolutionLabelId}
							>
								<SelectValue>
									{() =>
										RESOLUTION_OPTIONS.find((o) => o.value === resolution)
											?.label
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{RESOLUTION_OPTIONS.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<p className="text-xs text-muted-foreground">
					{m.videocomp_usually_takes({
						duration:
							minutes === 1
								? m.duration_about_a_minute()
								: m.duration_minutes_about({ minutes }),
					})}
				</p>

				<div className="flex flex-wrap justify-end gap-2">
					{compressing ? (
						<Button
							variant="outline"
							onClick={onCancel}
							disabled={cancelling}
							className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
						>
							{cancelling ? <Loader2 className="animate-spin" /> : <Ban />}
							{cancelling ? m.common_cancelling() : m.common_cancel()}
						</Button>
					) : (
						<Button variant="ghost" onClick={() => dispatch({ type: "reset" })}>
							{m.common_choose_another()}
						</Button>
					)}
					<Button
						onClick={onCompress}
						disabled={compressing || verdict.kind === "invalid"}
					>
						{compressing ? <Loader2 className="animate-spin" /> : <Minimize2 />}
						<span className="tabular-nums">{compressLabel}</span>
					</Button>
				</div>
			</div>

			{output?.kind === "compressed" && (
				<div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2.5">
					<div className="flex items-center gap-3">
						<Film className="size-4 shrink-0 text-muted-foreground" />
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium">{output.name}</p>
							<p className="text-xs text-muted-foreground tabular-nums">
								{formatBytes(file.size)} → {formatBytes(output.size)} ·{" "}
								{m.common_smaller({
									percent: Math.round((1 - output.size / file.size) * 100),
								})}
							</p>
						</div>
						<Button onClick={() => downloadBlob(output.blob, output.name)}>
							<Download />
							{m.common_save()}
						</Button>
					</div>
					{output.overTargetMB !== null && (
						<p className="text-xs text-muted-foreground">
							{/* Decimal MB, like the target; formatBytes is binary. */}
							{m.videocomp_over_target({
								size: formatDecimal(output.size / 1_000_000, 1),
								target: output.overTargetMB,
							})}
						</p>
					)}
				</div>
			)}

			{output?.kind === "kept" && (
				<div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
					<Film className="size-4 shrink-0 text-muted-foreground" />
					<p className="text-sm">{m.videocomp_kept_bigger()}</p>
				</div>
			)}
		</div>
	);
}
