import { Download, FileText } from "lucide-react";

import { downloadBlob, formatBytes } from "#/components/converter/utils.ts";
import { Button } from "#/components/ui/button.tsx";
import {
	type CompressPresetId,
	percentSaved,
} from "#/lib/file/pdf-compress-presets.ts";
import {
	$match,
	type CompressOutcome,
} from "#/lib/file/pdf-compress-result.ts";
import type { CompressStats } from "#/lib/file/pdf-types.ts";
import { m } from "#/paraglide/messages.js";

const baseName = (fileName: string) => fileName.replace(/\.pdf$/i, "");

// One sentence about what the image pass did. Light never ran one.
const summaryLine = (stats: CompressStats): string => {
	if (!stats.imagesPass) return m.pdfcomp_summary_light();

	if (stats.imagesRecompressed + stats.imagesSkipped === 0) {
		return m.pdfcomp_summary_no_images();
	}

	return m.pdfcomp_summary_images({
		recompressed: stats.imagesRecompressed,
		skipped: stats.imagesSkipped,
	});
};

// The outcome of one run. The wrapper is a polite live region, so the result
// is announced when it lands. The card pops in once per run (see styles.css).
export function ResultCard({
	file,
	outcome,
	preset,
}: {
	file: File;
	outcome: CompressOutcome | null;
	preset: CompressPresetId;
}) {
	return (
		<div aria-live="polite">
			{outcome &&
				$match(outcome, {
					Compressed: ({ blob, originalSize, size, stats }) => (
						<div className="animate-pop-in animate-done-tint flex flex-col gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2.5">
							<div className="flex items-center gap-3">
								<FileText className="size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{baseName(file.name)}_compressed.pdf
									</p>
									<p className="text-xs text-muted-foreground tabular-nums">
										{formatBytes(originalSize)} → {formatBytes(size)} ·{" "}
										{m.common_smaller({
											percent: percentSaved(originalSize, size),
										})}
									</p>
								</div>
								<Button
									onClick={() =>
										downloadBlob(blob, `${baseName(file.name)}_compressed.pdf`)
									}
								>
									<Download />
									{m.common_save()}
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">
								{summaryLine(stats)}
							</p>
						</div>
					),
					NotSmallerResult: ({ stats }) => (
						<div className="animate-pop-in flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5">
							<div className="flex items-center gap-3">
								<FileText className="size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium">
										{m.pdfcomp_not_smaller()}
									</p>
									<p className="text-xs text-muted-foreground">
										{preset === "small"
											? m.pdfcomp_not_smaller_kept()
											: m.pdfcomp_not_smaller_try_more()}
									</p>
								</div>
								<Button
									variant="outline"
									onClick={() => downloadBlob(file, file.name)}
								>
									<Download />
									{m.pdfcomp_save_original()}
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">
								{summaryLine(stats)}
							</p>
						</div>
					),
				})}
		</div>
	);
}
