import { useEffect, useEffectEvent, useRef, useState } from "react";

import { PickSurface } from "#/components/color/pick-surface.tsx";
import { Dropzone } from "#/components/dropzone.tsx";
import { HandoffNotice } from "#/components/handoff/handoff-notice.tsx";
import { useHandoff } from "#/hooks/use-handoff.ts";
import type { Rgb } from "#/lib/color/oklab.ts";
import { m } from "#/paraglide/messages.js";

/**
 * Pick a color from an image: drop one, choose one, or paste one anywhere on the
 * page. Waiting shows the dropzone; an image shows its surface.
 */
export function ImagePicker({
	onPick,
	onCommit,
}: {
	readonly onPick: (color: Rgb) => void;
	readonly onCommit: (color: Rgb) => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const idleRef = useRef<HTMLElement>(null);
	// Set when the section returns to waiting, so focus follows the person there.
	const refocusIdle = useRef(false);

	// An effect event always sees the latest handler, so the paste listener is
	// added once instead of on every render.
	const readPasted = useEffectEvent((pasted: File) => setFile(pasted));

	const handoff = useHandoff(
		(files) => {
			const chosen = files[0];

			if (chosen) setFile(chosen);
		},
		{ hasFile: file !== null },
	);

	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => {
			const image = Array.from(event.clipboardData?.files ?? []).find(
				(candidate) => candidate.type.startsWith("image/"),
			);

			if (!image) return;

			event.preventDefault();
			readPasted(image);
		};

		document.addEventListener("paste", onPaste);

		return () => document.removeEventListener("paste", onPaste);
	}, []);

	useEffect(() => {
		if (refocusIdle.current && !file) {
			refocusIdle.current = false;
			idleRef.current?.focus();
		}
	});

	if (file) {
		return (
			<div className="flex flex-col">
				<HandoffNotice handoff={handoff} />
				<PickSurface
					// A new image is a new surface, so it loads, focuses and animates again.
					key={`${file.name}-${file.lastModified}-${file.size}`}
					file={file}
					onPick={onPick}
					onCommit={onCommit}
					onReset={() => {
						refocusIdle.current = true;
						setFile(null);
					}}
				/>
			</div>
		);
	}

	return (
		<section
			ref={idleRef}
			tabIndex={-1}
			aria-label={m.color_image_aria()}
			className="flex flex-col gap-4 outline-none"
		>
			{/* The section's gap already spaces it. */}
			<HandoffNotice handoff={handoff} className="mb-0" />
			<Dropzone
				label={m.resizer_dropzone_label()}
				actionLabel={m.common_choose_image()}
				hint={m.common_image_dropzone_hint()}
				accept="image/*"
				ariaLabel={m.color_dropzone_aria()}
				onFiles={(files) => {
					const chosen = files?.[0];

					if (chosen) setFile(chosen);
				}}
			/>
			<p className="text-xs text-muted-foreground">
				{m.common_paste_image_hint()}
			</p>
		</section>
	);
}
