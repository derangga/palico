import { X } from "lucide-react";
import { useRef } from "react";

import { Button } from "#/components/ui/button.tsx";
import { useObjectUrl } from "#/hooks/use-object-url.ts";

// Before/after split view. The result image sits on top of the original and is
// cut off at the split; a native range input moves the split, so it works with
// the keyboard for free.
export function ComparePanel({
	name,
	before,
	after,
	onClose,
}: {
	name: string;
	before: Blob;
	after: Blob;
	onClose: () => void;
}) {
	const frameRef = useRef<HTMLDivElement>(null);
	const beforeUrl = useObjectUrl(before);
	const afterUrl = useObjectUrl(after);

	if (!beforeUrl || !afterUrl) return null;

	return (
		<section
			aria-label={`Compare ${name}`}
			className="mt-4 rounded-xl border bg-card p-4"
		>
			<div className="mb-3 flex items-center gap-2">
				<h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
					{name}
				</h2>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={onClose}
					aria-label="Close comparison"
				>
					<X />
				</Button>
			</div>
			<div
				ref={frameRef}
				className="relative overflow-hidden rounded-lg bg-muted"
				style={{ "--split": "50%" }}
			>
				<img
					src={beforeUrl}
					alt="Original"
					decoding="async"
					className="block max-h-[60vh] w-full object-contain"
				/>
				{/* The window slides right while the image inside slides left by the
				    same amount, so the picture stays still and only its left edge
				    moves. Both are transforms: no repaint, no React render per step. */}
				<div className="absolute inset-0 translate-x-(--split) overflow-hidden will-change-transform">
					<img
						src={afterUrl}
						alt="Compressed"
						decoding="async"
						className="absolute inset-0 size-full -translate-x-(--split) object-contain will-change-transform"
					/>
					<div
						aria-hidden
						className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-foreground/70"
					/>
				</div>
				<span className="absolute top-2 left-2 rounded-sm bg-background/80 px-1.5 py-0.5 text-xs font-semibold">
					Before
				</span>
				<span className="absolute top-2 right-2 rounded-sm bg-background/80 px-1.5 py-0.5 text-xs font-semibold">
					After
				</span>
			</div>
			<input
				type="range"
				min={0}
				max={100}
				defaultValue={50}
				onInput={(e) =>
					frameRef.current?.style.setProperty(
						"--split",
						`${e.currentTarget.value}%`,
					)
				}
				aria-label="Move the split between before and after"
				className="mt-3 w-full accent-primary"
			/>
		</section>
	);
}
