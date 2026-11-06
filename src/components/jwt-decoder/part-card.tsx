import { CopyTextButton } from "#/components/copy-text-button.tsx";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

import { type ColoredPart, cardTitle, PART_STYLE } from "./parts.ts";

/** The header or the payload as pretty-printed JSON, with a Copy button. */
export function PartCard({
	part,
	text,
	active,
	onActive,
}: {
	readonly part: "header" | "payload";
	readonly text: string;
	readonly active: ColoredPart | undefined;
	readonly onActive: (part: ColoredPart | undefined) => void;
}) {
	const header = part === "header";

	return (
		<section
			aria-label={cardTitle(part)}
			data-active={active === part || undefined}
			className="flex scroll-mt-20 flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-[border-color,box-shadow] duration-150 ease-out data-[active]:border-ring data-[active]:ring-3 data-[active]:ring-ring/40 sm:p-5"
			onPointerEnter={() => onActive(part)}
			onPointerLeave={() => onActive(undefined)}
		>
			<div className="flex min-h-9 items-center justify-between gap-2">
				<h2 className="flex items-center gap-2 text-sm font-semibold">
					<span
						aria-hidden
						className={cn("size-2.5 rounded-full", PART_STYLE[part].dot)}
					/>
					{cardTitle(part)}
				</h2>
				<CopyTextButton
					variant="outline"
					label={header ? m.jwt_copy_header() : m.jwt_copy_payload()}
					getText={() => text}
					copiedMessage={m.jwt_copied_announce()}
					failureMessage={m.jwt_copy_failed()}
					className="max-sm:h-11"
				/>
			</div>

			<section
				// oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region has to be reachable by keyboard.
				tabIndex={0}
				aria-label={header ? m.jwt_header_aria() : m.jwt_payload_aria()}
				className="max-h-80 overflow-auto rounded-md border border-input bg-background p-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<pre className="font-mono text-base whitespace-pre md:text-sm">
					{text}
				</pre>
			</section>
		</section>
	);
}
