import { Download } from "lucide-react";

import { downloadBlob } from "#/components/converter/utils.ts";
import { DoneBurst, DrawCheck } from "#/components/done-burst.tsx";
import { SendTo } from "#/components/handoff/send-to.tsx";
import { Button } from "#/components/ui/button.tsx";
import { m } from "#/paraglide/messages.js";

// The green card after a job: what was done, and a button to download the file again.
export function DoneCard({
	message,
	blob,
	name,
	play,
	sendable,
}: {
	readonly message: string;
	readonly blob: Blob;
	readonly name: string;
	// True once the job has just finished, for the burst. See `useJustDone`.
	readonly play: boolean;
	// False for a locked PDF: no other tool can open it without the password.
	readonly sendable: boolean;
}) {
	return (
		<output className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-success/15 px-4 py-3 text-sm">
			<p className="flex min-w-0 flex-1 items-start gap-2">
				<span className="relative mt-0.5 inline-flex shrink-0">
					<DrawCheck play={play} className="size-4 text-success" />
					{play && <DoneBurst />}
				</span>
				{message}
			</p>
			<div className="flex flex-wrap gap-2">
				{sendable && (
					<SendTo from="pdf_password" outputs={[{ blob, name }]} size="sm" />
				)}
				<Button
					variant="outline"
					size="sm"
					onClick={() => downloadBlob(blob, name)}
				>
					<Download />
					{m.pdfpw_download_again({ name })}
				</Button>
			</div>
		</output>
	);
}
