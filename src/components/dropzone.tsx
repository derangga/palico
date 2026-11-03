import { UploadCloud } from "lucide-react";
import { type DragEvent, useState } from "react";

import { buttonVariants } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

interface DropzoneProps {
	/** Prompt line, e.g. "Drag & drop images here, or". */
	readonly label: string;
	/** Text of the faux button under the prompt, e.g. "Choose files". */
	readonly actionLabel: string;
	/** Accepted types / limits, shown inside the zone, e.g. "PDF up to 50 MB". */
	readonly hint?: string;
	readonly accept: string;
	readonly multiple?: boolean;
	/** Accessible name of the underlying file input. */
	readonly ariaLabel: string;
	readonly disabled?: boolean;
	readonly onFiles: (fileList: FileList | null) => void;
}

const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

// The whole zone is a <label> around a visually hidden (but focusable) native
// file input, so click, Enter and Space open the picker with no JS and screen
// readers still get a real, named control.
export function Dropzone({
	label,
	actionLabel,
	hint,
	accept,
	multiple,
	ariaLabel,
	disabled,
	onFiles,
}: DropzoneProps) {
	const [dragging, setDragging] = useState(false);
	const active = dragging && !disabled;

	return (
		<label
			onDragEnter={(e) => {
				if (hasFiles(e)) setDragging(true);
			}}
			onDragOver={(e) => {
				e.preventDefault();
				if (hasFiles(e)) setDragging(true);
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
					setDragging(false);
				}
			}}
			onDrop={(e) => {
				e.preventDefault();
				setDragging(false);
				if (disabled) return;
				onFiles(e.dataTransfer.files);
			}}
			data-dragging={active || undefined}
			className={cn(
				"group relative flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-foreground/60 bg-card p-8 text-center transition-[border-color,background-color,box-shadow] duration-150 ease-out",
				"has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
				"data-[dragging]:border-solid data-[dragging]:border-primary data-[dragging]:bg-primary/10 data-[dragging]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_22%,transparent)]",
				disabled && "pointer-events-none cursor-not-allowed opacity-50",
			)}
		>
			<UploadCloud className="size-8 text-muted-foreground transition-colors duration-150 group-data-[dragging]:animate-hop group-data-[dragging]:text-primary" />
			<span className="mt-3 text-sm font-medium">{label}</span>
			<span
				className={cn(
					buttonVariants({ variant: "outline", size: "sm" }),
					"mt-3",
				)}
			>
				{actionLabel}
			</span>
			{hint && (
				<span className="mt-3 text-xs text-muted-foreground">{hint}</span>
			)}
			<input
				type="file"
				accept={accept}
				multiple={multiple}
				disabled={disabled}
				aria-label={ariaLabel}
				className="sr-only"
				onChange={(e) => {
					onFiles(e.target.files);
					e.target.value = "";
				}}
			/>
		</label>
	);
}
