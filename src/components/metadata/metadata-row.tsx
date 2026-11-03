import {
	CircleCheck,
	Download,
	FileText,
	ImageIcon,
	MapPin,
	X,
} from "lucide-react";

import { downloadBlob, formatBytes } from "#/components/converter/utils.ts";
import { useJustDone } from "#/components/done-burst.tsx";
import { type PillState, StatusPill } from "#/components/status-pill.tsx";
import { Button } from "#/components/ui/button.tsx";
import type { MetadataGroup, MetadataReport } from "#/lib/metadata/types.ts";
import { cn } from "#/lib/utils.ts";

export type MetadataItemStatus =
	| "reading"
	| "found"
	| "nothing"
	| "stripping"
	| "clean"
	| "error";

export interface MetadataItem {
	id: string;
	file: File;
	status: MetadataItemStatus;
	before?: MetadataReport;
	after?: MetadataReport;
	blob?: Blob;
	message?: string;
}

const GROUP_ORDER: ReadonlyArray<MetadataGroup> = [
	"Location",
	"Device",
	"Dates",
	"People",
	"Software",
	"Other",
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function pill(item: MetadataItem): { state: PillState; label: string } | null {
	switch (item.status) {
		case "reading":
			return { state: "working", label: "Reading" };
		case "stripping":
			return { state: "working", label: "Removing" };
		case "found":
			return {
				state: "warning",
				label: `${plural(item.before?.fields.length ?? 0, "item")} found`,
			};
		case "nothing":
			return { state: "info", label: "Nothing hidden" };
		case "clean":
			return { state: "done", label: "Clean" };
		case "error":
			return { state: "failed", label: "Failed" };
	}
}

function Findings({ report }: { report: MetadataReport }) {
	return (
		<div className="mt-3 flex flex-col gap-3">
			{report.gps && (
				<p className="flex items-start gap-2 rounded-md bg-warning/20 px-3 py-2 text-sm text-foreground">
					<MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
					<span>
						This photo records where it was taken:{" "}
						<span className="font-mono">
							{report.gps.lat.toFixed(5)}, {report.gps.lon.toFixed(5)}
						</span>
					</span>
				</p>
			)}
			{GROUP_ORDER.map((group) => {
				const fields = report.fields.filter((f) => f.group === group);
				if (fields.length === 0) return null;
				return (
					<div key={group}>
						<p className="text-xs font-semibold text-muted-foreground">
							{group}
						</p>
						<dl className="mt-1 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-0.5 text-sm">
							{fields.map((f) => (
								<div key={`${f.label}:${f.value}`} className="contents">
									<dt className="text-muted-foreground">{f.label}</dt>
									<dd className="min-w-0 truncate" title={f.value}>
										{f.value}
									</dd>
								</div>
							))}
						</dl>
					</div>
				);
			})}
		</div>
	);
}

export function MetadataRow({
	item,
	isRunning,
	onRemove,
}: {
	item: MetadataItem;
	isRunning: boolean;
	onRemove: () => void;
}) {
	const justDone = useJustDone(item.status === "clean");
	const status = pill(item);
	const Icon = item.file.type === "application/pdf" ? FileText : ImageIcon;
	const removed = item.before?.fields.length ?? 0;
	const kept = item.after?.kept ?? item.before?.kept ?? [];

	return (
		<li
			className={cn(
				"animate-pop-in rounded-lg border bg-card px-3 py-2.5",
				justDone && "animate-done-tint",
			)}
		>
			<div className="flex items-center gap-3">
				<Icon className="size-4 shrink-0 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">{item.file.name}</p>
					<p className="text-xs text-muted-foreground">
						{formatBytes(item.file.size)}
						{item.status === "clean" &&
							item.blob &&
							` → ${formatBytes(item.blob.size)}`}
					</p>
				</div>
				{status && (
					<StatusPill
						state={status.state}
						label={status.label}
						celebrate={justDone}
					/>
				)}
				{item.status === "clean" && item.blob && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => item.blob && downloadBlob(item.blob, item.file.name)}
					>
						<Download />
						Save
					</Button>
				)}
				{!isRunning && (
					<button
						type="button"
						onClick={onRemove}
						className="text-muted-foreground hover:text-foreground"
						aria-label={`Remove ${item.file.name}`}
					>
						<X className="size-4" />
					</button>
				)}
			</div>

			{item.status === "error" && item.message && (
				<p className="mt-2 text-sm text-destructive">{item.message}</p>
			)}
			{item.status === "nothing" && (
				<p className="mt-2 flex items-center gap-2 text-sm">
					<CircleCheck aria-hidden className="size-4 text-success" />
					Nothing hidden in this file.
				</p>
			)}
			{(item.status === "found" || item.status === "stripping") &&
				item.before && <Findings report={item.before} />}
			{item.status === "clean" && (
				<p className="mt-2 text-sm">
					Removed {plural(removed, "item")}. A second read of the new file found
					nothing left.
					{kept.length > 0 && (
						<span className="text-muted-foreground">
							{" "}
							Kept: {kept.join(", ")}.
						</span>
					)}
				</p>
			)}
		</li>
	);
}
