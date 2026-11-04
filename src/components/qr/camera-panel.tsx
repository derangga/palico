import { Camera, CameraOff, Loader2, X } from "lucide-react";
import { type RefObject, useEffect } from "react";

import { Button } from "#/components/ui/button.tsx";
import type { CameraStatus } from "#/hooks/use-qr-camera.ts";

/**
 * The live scanner. The <video> stays mounted from "starting" on so the hook
 * can attach the stream the moment the camera opens. Escape stops the camera.
 */
export function CameraPanel({
	videoRef,
	status,
	message,
	onStop,
	onRetry,
	onChooseImage,
}: {
	readonly videoRef: RefObject<HTMLVideoElement | null>;
	readonly status: Exclude<CameraStatus, "idle">;
	readonly message: string | null;
	readonly onStop: () => void;
	readonly onRetry: () => void;
	readonly onChooseImage: () => void;
}) {
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onStop();
		};

		window.addEventListener("keydown", onKey);

		return () => window.removeEventListener("keydown", onKey);
	}, [onStop]);

	if (status === "error") {
		return (
			<section
				aria-label="Camera"
				role="alert"
				className="animate-pop-in flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm"
			>
				<div className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
					<CameraOff aria-hidden className="size-6" />
				</div>
				<div className="max-w-sm">
					<h2 className="font-semibold">Couldn't use the camera</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{message ?? "Something went wrong while opening the camera."}
					</p>
				</div>
				<div className="flex flex-wrap justify-center gap-2">
					<Button onClick={onRetry}>
						<Camera />
						Try again
					</Button>
					<Button variant="outline" onClick={onChooseImage}>
						Choose an image instead
					</Button>
				</div>
			</section>
		);
	}

	return (
		<section
			aria-label="Camera scanner"
			className="animate-pop-in relative overflow-hidden rounded-xl border bg-secondary shadow-sm"
		>
			<video
				ref={videoRef}
				playsInline
				muted
				aria-label="Camera preview"
				className="aspect-[4/3] max-h-[70vh] w-full object-cover"
			/>

			{status === "starting" ? (
				<output className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary text-sm">
					<Loader2
						aria-hidden
						className="size-6 animate-spin text-muted-foreground"
					/>
					Starting the camera…
					<span className="max-w-xs px-4 text-center text-xs text-muted-foreground">
						Your browser may ask for permission. The video stays on your device.
					</span>
				</output>
			) : (
				<>
					<div
						aria-hidden
						className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-primary"
					/>
					<div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-background/80 px-4 py-3 backdrop-blur-sm">
						<output className="text-sm">
							Point the camera at a QR code. It reads by itself.
						</output>
						<Button variant="secondary" size="sm" onClick={onStop}>
							<X />
							Stop
						</Button>
					</div>
				</>
			)}

			{status === "starting" && (
				<div className="absolute right-3 bottom-3">
					<Button variant="secondary" size="sm" onClick={onStop}>
						<X />
						Cancel
					</Button>
				</div>
			)}
		</section>
	);
}
