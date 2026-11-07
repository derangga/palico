import { Effect } from "effect";
import { FileText, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Dropzone } from "#/components/dropzone.tsx";
import { HandoffNotice } from "#/components/handoff/handoff-notice.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { EnginePanel } from "#/components/pdf-password/engine-panel.tsx";
import { LockForm } from "#/components/pdf-password/lock-form.tsx";
import { UnlockForm } from "#/components/pdf-password/unlock-form.tsx";
import { SegmentedControl } from "#/components/segmented-control.tsx";
import { StatusPill } from "#/components/status-pill.tsx";
import { Button } from "#/components/ui/button.tsx";
import { useHandoff } from "#/hooks/use-handoff.ts";
import { useQpdfGate } from "#/hooks/use-qpdf-gate.ts";
import { MAX_PDF_BYTES } from "#/lib/file/pdf-types.ts";
import { formatBytes } from "#/lib/format-bytes.ts";
import {
	detectEncryption,
	modeHint,
	modeAfterDetect,
} from "#/lib/pdf-password/detect.ts";
import type {
	EncryptionStatus,
	PasswordMode,
} from "#/lib/pdf-password/shapes.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

const MB = 1024 * 1024;

// Lock and Unlock are one tool with a switch. The file, what we learned about it and
// the engine belong to the page; each mode's form owns its own passwords, so they are
// gone when the mode changes.
//
// The mode starts as `initialMode` (a deep link), and otherwise follows the file once
// it is read: a file with a password starts on Unlock, any other on Lock. Once the
// person has chosen a mode, by the switch or by the link, it never moves on its own.
// A file that looks like it belongs in the other mode gets a note with a button.
export function PdfPasswordTool({
	initialMode,
}: {
	readonly initialMode?: PasswordMode;
}) {
	const gate = useQpdfGate();

	const [mode, setMode] = useState<PasswordMode>(initialMode ?? "protect");
	const [file, setFile] = useState<File>();
	const [fileId, setFileId] = useState(0);
	const [encryption, setEncryption] = useState<EncryptionStatus>();
	const [working, setWorking] = useState(false);
	// True while the last input on the switch was a pointer, not a key. Only then
	// does the form fade in: a key press that repeats all day gets no animation.
	const [fadeForms, setFadeForms] = useState(false);

	const switchRef = useRef<HTMLDivElement>(null);
	const chosen = useRef(initialMode !== undefined);
	// The file most recently dropped. Detecting a file's state is asynchronous, and a
	// result for a file that has since been replaced is dropped.
	const latestFile = useRef<File>(undefined);

	function chooseMode(next: PasswordMode) {
		chosen.current = true;
		setMode(next);
	}

	function resetFile() {
		latestFile.current = undefined;
		setFile(undefined);
		setEncryption(undefined);
	}

	async function pick(list: FileList | null) {
		const picked = list?.[0];

		if (!picked) return;

		if (picked.type !== "application/pdf" && !/\.pdf$/i.test(picked.name)) {
			toast.error(m.pdf_open_failed_named({ name: picked.name }));

			return;
		}

		if (picked.size > MAX_PDF_BYTES) {
			toast.error(
				m.error_pdf_too_large({
					name: picked.name,
					limit: Math.round(MAX_PDF_BYTES / MB),
				}),
			);

			return;
		}

		resetFile();
		latestFile.current = picked;
		setFile(picked);
		setFileId((id) => id + 1);

		const status = await Effect.runPromise(detectEncryption(picked));

		if (latestFile.current !== picked) return;

		setEncryption(status);

		setMode((current) => modeAfterDetect(current, chosen.current, status));
	}

	const handoff = useHandoff((files) => void pick(files), {
		hasFile: file !== undefined,
	});

	const target = file && encryption ? modeHint(mode, encryption) : undefined;

	return (
		<PageShell>
			<PageHeader
				title={m.tool_pdf_password_label()}
				actions={
					file && (
						<Button
							variant="outline"
							size="sm"
							onClick={resetFile}
							disabled={working}
						>
							<RotateCcw />
							{m.common_choose_another()}
						</Button>
					)
				}
			>
				{m.pdfpw_description()}
			</PageHeader>

			<HandoffNotice handoff={handoff} />

			<EnginePanel phase={gate.phase} onStart={() => void gate.startLoad()} />

			{gate.phase.kind === "ready" && (
				<div className="grid gap-5">
					<div
						ref={switchRef}
						onPointerDownCapture={() => setFadeForms(true)}
						onKeyDownCapture={() => setFadeForms(false)}
						// Clicking the segment that is already on fires no change event, but
						// it still says what the person wants.
						onClickCapture={() => {
							chosen.current = true;
						}}
					>
						<SegmentedControl
							legend={m.pdfpw_mode_legend()}
							name="pdfpw-mode"
							value={mode}
							onChange={chooseMode}
							disabled={working}
							segments={[
								{ value: "protect", label: m.pdfpw_mode_lock() },
								{ value: "unlock", label: m.pdfpw_mode_unlock() },
							]}
						/>
					</div>

					{!file && (
						<Dropzone
							label={m.pdf_dropzone_label()}
							actionLabel={m.common_choose_file()}
							hint={m.pdfpw_dropzone_hint({
								mb: Math.round(MAX_PDF_BYTES / MB),
							})}
							accept="application/pdf"
							ariaLabel={m.pdfpw_dropzone_aria()}
							onFiles={(files) => void pick(files)}
						/>
					)}

					{file && (
						<div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
							<FileText
								aria-hidden
								className="size-4 shrink-0 text-muted-foreground"
							/>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">{file.name}</p>
								<p className="text-xs text-muted-foreground">
									{formatBytes(file.size)}
								</p>
							</div>
							{encryption && (
								<StatusPill
									state="info"
									label={
										encryption === "encrypted"
											? m.pdfpw_file_locked()
											: m.pdfpw_file_open()
									}
								/>
							)}
						</div>
					)}

					{target && (
						<output className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-info/15 px-4 py-3 text-sm">
							<p className="min-w-0 flex-1">
								{target === "unlock"
									? m.pdfpw_notice_locked()
									: m.pdfpw_error_not_encrypted()}
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={(event) => {
									// detail is 0 for a key press: no fade, as on the switch.
									setFadeForms(event.detail > 0);
									chooseMode(target);
									// The button leaves with the note. Put focus on the switch.
									requestAnimationFrame(() =>
										switchRef.current
											?.querySelector<HTMLInputElement>("input:checked")
											?.focus(),
									);
								}}
								disabled={working}
							>
								{target === "unlock"
									? m.pdfpw_switch_unlock()
									: m.pdfpw_switch_protect()}
							</Button>
						</output>
					)}

					{/* Not before the file has been read: the mode can still move to match
					    it, and a form that mounts first would be replaced under the
					    person's hands, or mid-job. Reading a file is quick. */}
					{file && encryption && (
						<div
							// A new key per mode and per file gives each form fresh state: no
							// stale result from the last file, and no password carried across.
							key={`${mode}-${fileId}`}
							className={cn(
								"grid gap-5",
								fadeForms &&
									"transition-[opacity,translate] duration-150 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0",
							)}
						>
							{mode === "protect" ? (
								<LockForm
									file={file}
									working={working}
									onWorkingChange={setWorking}
									onEngineError={gate.fail}
								/>
							) : (
								<UnlockForm
									file={file}
									working={working}
									onWorkingChange={setWorking}
									onEngineError={gate.fail}
								/>
							)}
						</div>
					)}
				</div>
			)}
		</PageShell>
	);
}
