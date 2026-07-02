import { UploadCloud } from "lucide-react";
import type { RefObject } from "react";

import { Button } from "#/components/ui/button.tsx";

export function Dropzone({
	inputId,
	fileInputRef,
	onFiles,
}: {
	inputId: string;
	fileInputRef: RefObject<HTMLInputElement | null>;
	onFiles: (fileList: FileList | null) => void;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: dropzone wraps a real file input.
		<div
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				onFiles(e.dataTransfer.files);
			}}
			className="rounded-xl border border-dashed bg-card p-8 text-center"
		>
			<UploadCloud className="mx-auto size-8 text-muted-foreground" />
			<p className="mt-3 text-sm font-medium">Drag &amp; drop a PDF here, or</p>
			<Button
				variant="outline"
				size="sm"
				className="mt-3"
				onClick={() => fileInputRef.current?.click()}
			>
				Choose file
			</Button>
			<input
				id={inputId}
				ref={fileInputRef}
				type="file"
				accept="application/pdf"
				aria-label="Choose a PDF to split"
				className="hidden"
				onChange={(e) => {
					onFiles(e.target.files);
					e.target.value = "";
				}}
			/>
		</div>
	);
}
