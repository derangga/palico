import { UploadCloud } from "lucide-react";
import type { RefObject } from "react";

import { Button } from "#/components/ui/button.tsx";

export function Dropzone({
	inputId,
	fileInputRef,
	isRunning,
	onFiles,
}: {
	inputId: string;
	fileInputRef: RefObject<HTMLInputElement | null>;
	isRunning: boolean;
	onFiles: (fileList: FileList | null) => void;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: dropzone wraps a real file input.
		<div
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				if (isRunning) return;
				onFiles(e.dataTransfer.files);
			}}
			className="rounded-xl border border-dashed bg-card p-8 text-center"
		>
			<UploadCloud className="mx-auto size-8 text-muted-foreground" />
			<p className="mt-3 text-sm font-medium">
				Drag &amp; drop videos here, or
			</p>
			<Button
				variant="outline"
				size="sm"
				className="mt-3"
				disabled={isRunning}
				onClick={() => fileInputRef.current?.click()}
			>
				Choose files
			</Button>
			<input
				id={inputId}
				ref={fileInputRef}
				type="file"
				accept="video/*"
				multiple
				aria-label="Choose videos to convert"
				className="hidden"
				onChange={(e) => {
					onFiles(e.target.files);
					e.target.value = "";
				}}
			/>
		</div>
	);
}
