import { Cause, Effect, Exit, Option } from "effect";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import {
	type ExtractView,
	PaletteResult,
} from "#/components/palette/palette-result.tsx";
import type { ColorFormat } from "#/lib/color/format.ts";
import { readPaletteFromFile } from "#/lib/color/worker-client.ts";

interface ExtractState {
	readonly view: ExtractView;
	readonly file: File;
}

const DEFAULT_COUNT = 6;

export function PaletteExtractor() {
	// Null while the page waits for an image; otherwise the result being shown.
	const [state, setState] = useState<ExtractState | null>(null);
	// The format and count outlive one image, so the next one comes out the same way.
	const [format, setFormat] = useState<ColorFormat>("hex");
	const [count, setCount] = useState(DEFAULT_COUNT);
	// Only the newest read may write its result. Dropping a second image while
	// the first is still working must not let the first overwrite it.
	const latestRead = useRef(0);
	// Aborting interrupts the read, which ends its worker. Without it a replaced
	// or abandoned read keeps running.
	const reading = useRef<AbortController | null>(null);
	const idleRef = useRef<HTMLElement>(null);
	// Set when the page returns to waiting, so focus follows the person there.
	const refocusIdle = useRef(false);

	function cancelRead() {
		latestRead.current++;
		reading.current?.abort();
		reading.current = null;
	}

	async function readFile(file: File | undefined) {
		if (!file) return;

		cancelRead();

		const id = latestRead.current;

		// Some systems report no type for HEIC or AVIF files. Those go to the
		// decoder, which accepts or refuses them; only a known non-image stops here.
		if (file.type !== "" && !file.type.startsWith("image/")) {
			setState({
				view: {
					phase: "failed",
					message: `"${file.name}" isn't an image. Choose a PNG, JPG, WebP or GIF file.`,
				},
				file,
			});

			return;
		}

		const controller = new AbortController();

		reading.current = controller;
		setState({ view: { phase: "reading" }, file });

		const exit = await Effect.runPromiseExit(readPaletteFromFile(file), {
			signal: controller.signal,
		});

		if (id !== latestRead.current) return;

		reading.current = null;

		if (Exit.isSuccess(exit)) {
			setState({ view: { phase: "found", colors: exit.value }, file });

			return;
		}

		const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

		if (!failure) console.error(Cause.pretty(exit.cause));

		setState({
			view: {
				phase: "failed",
				message:
					failure?.message ?? "Something went wrong while reading this image.",
			},
			file,
		});
	}

	function reset() {
		cancelRead();
		refocusIdle.current = true;
		setState(null);
	}

	// Paste an image anywhere on the page. An effect event always sees the
	// latest handler, so the listener is added once instead of on every render.
	const readPasted = useEffectEvent((file: File) => {
		void readFile(file);
	});

	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => {
			const image = Array.from(event.clipboardData?.files ?? []).find((file) =>
				file.type.startsWith("image/"),
			);

			if (!image) return;

			event.preventDefault();
			readPasted(image);
		};

		document.addEventListener("paste", onPaste);

		return () => document.removeEventListener("paste", onPaste);
	}, []);

	// Leaving the page ends any read still in flight.
	useEffect(
		() => () => {
			reading.current?.abort();
		},
		[],
	);

	// Back to waiting: move focus to the picker so the next step is one key away.
	useEffect(() => {
		if (refocusIdle.current && !state) {
			refocusIdle.current = false;
			idleRef.current?.focus();
		}
	});

	return (
		<PageShell>
			<PageHeader title="Palette Extractor">
				Drop in an image to get its main colors. Click a color to copy it.
				Everything is read on your device.
			</PageHeader>

			{state ? (
				<PaletteResult
					// A new image is a new card, so focus and the entrance play again.
					key={`${state.file.name}-${state.file.lastModified}-${state.file.size}`}
					view={state.view}
					file={state.file}
					count={count}
					format={format}
					onCountChange={setCount}
					onFormatChange={setFormat}
					onReset={reset}
				/>
			) : (
				<section
					ref={idleRef}
					tabIndex={-1}
					aria-label="Choose an image"
					className="flex flex-col gap-4 outline-none"
				>
					<Dropzone
						label="Drag & drop an image here, or"
						actionLabel="Choose image"
						hint="PNG, JPG, WebP or GIF, up to 25 MB"
						accept="image/*"
						ariaLabel="Choose an image to read its colors"
						onFiles={(files) => void readFile(files?.[0])}
					/>
					<p className="text-xs text-muted-foreground">
						You can also paste an image with Ctrl+V or ⌘+V.
					</p>
				</section>
			)}
		</PageShell>
	);
}
