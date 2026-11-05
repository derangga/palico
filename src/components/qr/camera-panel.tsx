import { Camera, CameraOff, Loader2, X } from "lucide-react";
import { type RefObject, useEffect, useRef } from "react";

import { Button } from "#/components/ui/button.tsx";
import type { CameraStatus } from "#/hooks/use-qr-camera.ts";

/**
 * The live scanner. The <video> stays mounted from "starting" on so the hook
 * can attach the stream the moment the camera opens. Escape stops the camera,
 * and focus moves to the main control of each state.
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
	// Whichever button is the main control right now: Cancel, Stop or Try again.
	const primaryRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		primaryRef.current?.focus();
	}, [status]);

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
				className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm"
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
					<Button ref={primaryRef} onClick={onRetry}>
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

	const starting = status === "starting";

	return (
		<section
			aria-label="Camera scanner"
			className="animate-pop-in overflow-hidden rounded-xl border bg-card shadow-sm"
		>
			<div className="relative bg-secondary">
				<video
					ref={videoRef}
					playsInline
					muted
					aria-label="Camera preview"
					className="aspect-[4/3] max-h-[70vh] w-full object-cover"
				/>

				{starting ? (
					<div
						aria-hidden
						className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary px-4 text-center"
					>
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
						<span className="max-w-xs text-xs text-muted-foreground">
							Your browser may ask for permission. The video stays on your
							device.
						</span>
					</div>
				) : (
					// Decoration only: the reader looks at the whole frame, not this square.
					<div
						aria-hidden
						className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-primary"
					/>
				)}
			</div>

			<div className="flex items-center justify-between gap-3 px-4 py-3">
				<output className="text-sm">
					{starting
						? "Starting the camera…"
						: "Point the camera at a QR code. It reads by itself."}
				</output>
				<Button ref={primaryRef} variant="secondary" size="sm" onClick={onStop}>
					<X />
					{starting ? "Cancel" : "Stop"}
				</Button>
			</div>
		</section>
	);
}
