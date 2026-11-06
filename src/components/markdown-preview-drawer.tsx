import { X } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { MarkdownActions } from "#/components/markdown-preview-panel.tsx";
import { MarkdownPreview } from "#/components/markdown-preview.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { m } from "#/paraglide/messages.js";

type SnapPoint = NonNullable<ComponentProps<typeof Drawer>["snapPoint"]>;

// Fractions of the viewport height. The peek leaves the top half of the screen
// for the editor, so the preview updates under the person's thumbs. The second
// stop is for reading the whole document.
const PEEK: SnapPoint = 0.5;
const SNAP_POINTS: SnapPoint[] = [PEEK, 1];

/**
 * The phone version of the preview panel. It is a bottom sheet that does not
 * lock the page, so the editor above it stays usable. Pressing the editor must
 * not close it (`disablePointerDismissal`). Swiping down or Escape does.
 */
export function MarkdownPreviewDrawer({
	source,
	previewSource,
	open,
	onOpenChange,
}: {
	readonly source: string;
	readonly previewSource: string;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const [snapPoint, setSnapPoint] = useState<SnapPoint | null>(PEEK);

	return (
		<Drawer
			open={open}
			onOpenChange={(next) => {
				// Every open starts at the peek, not where the last one was dragged to.
				if (next) setSnapPoint(PEEK);
				onOpenChange(next);
			}}
			modal={false}
			disablePointerDismissal
			snapPoints={SNAP_POINTS}
			snapPoint={snapPoint}
			onSnapPointChange={setSnapPoint}
		>
			<DrawerContent
				backdrop={false}
				className="h-dvh max-h-dvh pt-[env(safe-area-inset-top)] data-expanded:rounded-t-none"
			>
				<DrawerHeader>
					<DrawerTitle>{m.markdown_preview()}</DrawerTitle>
					<div className="flex items-center gap-1">
						<MarkdownActions source={source} className="size-11" />
						<DrawerClose
							render={
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="size-11"
								/>
							}
						>
							<X />
							<span className="sr-only">{m.sheet_close()}</span>
						</DrawerClose>
					</div>
				</DrawerHeader>
				<div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-6">
					<MarkdownPreview source={previewSource} />
				</div>
			</DrawerContent>
		</Drawer>
	);
}
