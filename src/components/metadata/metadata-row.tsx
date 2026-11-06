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
import {
	fieldLabel,
	fieldValue,
	groupLabel,
	itemCount,
	keptLabel,
} from "#/lib/metadata/display.ts";
import type { MetadataGroup, MetadataReport } from "#/lib/metadata/types.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

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

function pill(item: MetadataItem): { state: PillState; label: string } | null {
	switch (item.status) {
		case "reading":
			return { state: "working", label: m.metadata_pill_reading() };
		case "stripping":
			return { state: "working", label: m.metadata_pill_removing() };
		case "found":
			return {
				state: "warning",
				label: m.metadata_pill_found({
					items: itemCount(item.before?.fields.length ?? 0),
				}),
			};
		case "nothing":
			return { state: "info", label: m.metadata_pill_nothing() };
		case "clean":
			return { state: "done", label: m.metadata_pill_clean() };
		case "error":
			return { state: "failed", label: m.metadata_pill_failed() };
	}
}

function Findings({ report }: { report: MetadataReport }) {
	return (
		<div className="mt-3 flex flex-col gap-3">
			{report.gps && (
				<p className="flex items-start gap-2 rounded-md bg-warning/20 px-3 py-2 text-sm text-foreground">
					<MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
					<span>
						{m.metadata_gps_note()}{" "}
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
							{groupLabel(group)}
						</p>
						<dl className="mt-1 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-0.5 text-sm">
							{fields.map((f) => (
								<div key={`${f.label}:${f.value}`} className="contents">
									<dt className="text-muted-foreground">
										{fieldLabel(f.label)}
									</dt>
									<dd className="min-w-0 truncate" title={fieldValue(f.value)}>
										{fieldValue(f.value)}
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
						{m.common_save()}
					</Button>
				)}
				{!isRunning && (
					<button
						type="button"
						onClick={onRemove}
						className="text-muted-foreground hover:text-foreground"
						aria-label={m.common_remove_file({ name: item.file.name })}
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
					{m.metadata_nothing_hidden()}
				</p>
			)}
			{(item.status === "found" || item.status === "stripping") &&
				item.before && <Findings report={item.before} />}
			{item.status === "clean" && (
				<p className="mt-2 text-sm">
					{m.metadata_removed({ items: itemCount(removed) })}
					{kept.length > 0 && (
						<span className="text-muted-foreground">
							{" "}
							{m.metadata_kept({ list: kept.map(keptLabel).join(", ") })}
						</span>
					)}
				</p>
			)}
		</li>
	);
}
