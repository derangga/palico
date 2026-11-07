import { Link } from "@tanstack/react-router";
import { Effect } from "effect";
import {
	CircleAlert,
	Download,
	FileText,
	Loader2,
	Lock,
	LockOpen,
	RotateCcw,
	ShieldCheck,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { downloadBlob } from "#/components/converter/utils.ts";
import { DoneBurst, DrawCheck, useJustDone } from "#/components/done-burst.tsx";
import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { EnginePanel } from "#/components/pdf-password/engine-panel.tsx";
import { PasswordField } from "#/components/pdf-password/password-field.tsx";
import { ProtectAdvanced } from "#/components/pdf-password/protect-advanced.tsx";
import { StatusPill } from "#/components/status-pill.tsx";
import { Button, buttonVariants } from "#/components/ui/button.tsx";
import { useQpdfGate } from "#/hooks/use-qpdf-gate.ts";
import { MAX_PDF_BYTES } from "#/lib/file/pdf-types.ts";
import { formatBytes } from "#/lib/format-bytes.ts";
import { withBusy } from "#/lib/offline/busy.ts";
import {
	detectEncryption,
	type ModeNotice,
	modeNotice,
} from "#/lib/pdf-password/detect.ts";
import {
	type JobOutcome,
	runProtect,
	runUnlock,
} from "#/lib/pdf-password/outcome.ts";
import { PdfCryptLive } from "#/lib/pdf-password/service.ts";
import {
	ALL_ALLOWED,
	type EncryptionStatus,
	type PasswordMode,
	type Permissions,
} from "#/lib/pdf-password/shapes.ts";
import { passwordStrength } from "#/lib/pdf-password/strength.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

const MB = 1024 * 1024;

const strengthHint = (password: string) => {
	switch (passwordStrength(password)) {
		case "weak":
			return m.pdfpw_strength_weak();
		case "fair":
			return m.pdfpw_strength_fair();
		case "strong":
			return m.pdfpw_strength_strong();
		default:
			return undefined;
	}
};

// The note shown when the dropped file looks like it belongs on the other page, and
// the page to send the person to. The file is not carried across: that page asks for
// it again.
const noticeFor = (notice: ModeNotice) =>
	notice === "locked"
		? {
				text: m.pdfpw_notice_locked(),
				label: m.pdfpw_switch_unlock(),
				to: "/pdf-unlock",
			}
		: {
				text: m.pdfpw_error_not_encrypted(),
				label: m.pdfpw_switch_protect(),
				to: "/pdf-protect",
			};

// Protect PDF and Unlock PDF are two pages (two routes, two registry entries) over
// one component. `mode` is fixed by the page.
export function PdfPasswordTool({ mode }: { readonly mode: PasswordMode }) {
	const gate = useQpdfGate();

	const [file, setFile] = useState<File>();
	const [encryption, setEncryption] = useState<EncryptionStatus>();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [ownerPassword, setOwnerPassword] = useState("");
	const [permissions, setPermissions] = useState<Permissions>(ALL_ALLOWED);
	const [unlockPassword, setUnlockPassword] = useState("");
	const [shownPasswords, setShownPasswords] = useState(false);
	const [working, setWorking] = useState(false);
	const [outcome, setOutcome] = useState<JobOutcome>();

	const passwordRef = useRef<HTMLInputElement>(null);
	const confirmRef = useRef<HTMLInputElement>(null);
	const unlockRef = useRef<HTMLInputElement>(null);
	// The file most recently dropped. Detecting a file's state is asynchronous, and a
	// result for a file that has since been replaced is dropped.
	const latestFile = useRef<File>(undefined);

	const done = outcome?.kind === "done" ? outcome : undefined;
	const fieldError = outcome?.kind === "field" ? outcome : undefined;
	const blocked = outcome?.kind === "blocked" ? outcome.message : undefined;
	const justDone = useJustDone(done !== undefined);

	// After a wrong password (or an empty or mismatched one), put the cursor back in
	// the field that needs fixing, with its text selected so a retry replaces it.
	useEffect(() => {
		if (!fieldError) return;

		const input =
			fieldError.field === "confirm"
				? confirmRef.current
				: mode === "unlock"
					? unlockRef.current
					: passwordRef.current;

		input?.focus();
		input?.select();
	}, [fieldError, mode]);

	function clearPasswords() {
		setPassword("");
		setConfirm("");
		setOwnerPassword("");
		setPermissions(ALL_ALLOWED);
		setUnlockPassword("");
	}

	function resetFile() {
		latestFile.current = undefined;
		setFile(undefined);
		setEncryption(undefined);
		clearPasswords();
		setOutcome(undefined);
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

		const status = await Effect.runPromise(detectEncryption(picked));

		if (latestFile.current === picked) setEncryption(status);
	}

	async function run() {
		if (!file || working) return;

		setWorking(true);
		setOutcome(undefined);

		const job =
			mode === "protect"
				? runProtect(file, {
						password,
						confirm,
						ownerPassword,
						permissions,
					})
				: runUnlock(file, unlockPassword);

		let result: JobOutcome;

		try {
			result = await Effect.runPromise(
				withBusy(job).pipe(Effect.provide(PdfCryptLive)),
			);
		} catch {
			// The job maps its own failures and defects to an outcome, so only the
			// busy marker can reject here. The form must not stay stuck on "Working".
			result = { kind: "failed", message: m.pdfpw_error_unexpected() };
		} finally {
			setWorking(false);
		}

		setOutcome(result);

		switch (result.kind) {
			case "done":
				// The file is made. Nothing needs the passwords any more, so they do not
				// stay in the page's memory.
				clearPasswords();
				downloadBlob(result.blob, result.name);
				break;
			case "engine":
				gate.fail(result.message);
				break;
			case "failed":
				toast.error(result.message);
				break;
			default:
				break;
		}
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		void run();
	}

	const mismatch = mode === "protect" && confirm !== "" && confirm !== password;

	const passwordError =
		fieldError?.field === "password" && mode === "protect"
			? fieldError.message
			: undefined;

	const confirmError = mismatch
		? m.pdfpw_error_mismatch()
		: fieldError?.field === "confirm"
			? fieldError.message
			: undefined;

	const notice = file && encryption ? modeNotice(mode, encryption) : undefined;

	const redirect = notice ? noticeFor(notice) : undefined;

	const title =
		mode === "protect" ? m.tool_pdf_protect_label() : m.tool_pdf_unlock_label();

	return (
		<PageShell>
			<PageHeader
				title={title}
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
				{mode === "protect"
					? m.pdfpw_description_protect()
					: m.pdfpw_description_unlock()}
			</PageHeader>

			<EnginePanel phase={gate.phase} onStart={() => void gate.startLoad()} />

			{gate.phase.kind === "ready" && (
				<div className="grid gap-5">
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

					{redirect && (
						<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-info/15 px-4 py-3 text-sm">
							<p className="min-w-0 flex-1">{redirect.text}</p>
							<Link
								to={redirect.to}
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
								)}
							>
								{redirect.label}
							</Link>
						</div>
					)}

					{file && (
						<form onSubmit={submit} className="grid gap-5" noValidate>
							{mode === "protect" ? (
								<>
									<div className="grid gap-4">
										<PasswordField
											id="pdfpw-password"
											ref={passwordRef}
											label={m.pdfpw_password_label()}
											value={password}
											onChange={(value) => {
												setPassword(value);
												setOutcome(undefined);
											}}
											shown={shownPasswords}
											onToggleShown={() => setShownPasswords((on) => !on)}
											disabled={working}
											error={passwordError}
											hint={strengthHint(password)}
										/>
										<PasswordField
											id="pdfpw-confirm"
											ref={confirmRef}
											label={m.pdfpw_confirm_label()}
											value={confirm}
											onChange={(value) => {
												setConfirm(value);
												setOutcome(undefined);
											}}
											shown={shownPasswords}
											onToggleShown={() => setShownPasswords((on) => !on)}
											disabled={working}
											error={confirmError}
										/>
									</div>
									<ProtectAdvanced
										ownerPassword={ownerPassword}
										onOwnerChange={(value) => {
											setOwnerPassword(value);

											// Without an owner password every permission is on, which is
											// what the job will do. Show that, not stale switches.
											if (value === "") setPermissions(ALL_ALLOWED);
										}}
										permissions={permissions}
										onPermissionsChange={setPermissions}
										sameAsOpen={
											ownerPassword !== "" && ownerPassword === password
										}
										shown={shownPasswords}
										onToggleShown={() => setShownPasswords((on) => !on)}
										disabled={working}
									/>
									<p className="text-xs text-muted-foreground">
										{m.pdfpw_forget_warning()}
									</p>
								</>
							) : (
								<div className="grid gap-4">
									<p className="flex items-start gap-2 text-sm text-muted-foreground">
										<ShieldCheck
											aria-hidden
											className="mt-0.5 size-4 shrink-0"
										/>
										{m.pdfpw_unlock_notice()}
									</p>
									<PasswordField
										id="pdfpw-unlock"
										ref={unlockRef}
										label={m.pdfpw_unlock_label()}
										value={unlockPassword}
										onChange={(value) => {
											setUnlockPassword(value);
											setOutcome(undefined);
										}}
										shown={shownPasswords}
										onToggleShown={() => setShownPasswords((on) => !on)}
										disabled={working}
										error={fieldError ? fieldError.message : undefined}
										hint={m.pdfpw_unlock_hint()}
									/>
								</div>
							)}

							{blocked && (
								<p
									role="alert"
									className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm"
								>
									<CircleAlert
										aria-hidden
										className="mt-0.5 size-4 shrink-0 text-destructive"
									/>
									{blocked}
								</p>
							)}

							<div className="flex flex-wrap items-center gap-3">
								<Button type="submit" disabled={working}>
									{working ? (
										<Loader2 className="animate-spin" />
									) : mode === "protect" ? (
										<Lock />
									) : (
										<LockOpen />
									)}
									{working
										? m.pdfpw_working()
										: mode === "protect"
											? m.pdfpw_run_protect()
											: m.pdfpw_run_unlock()}
								</Button>
								<p className="min-w-0 flex-1 text-xs text-muted-foreground">
									{m.pdfpw_privacy()}
								</p>
							</div>
						</form>
					)}

					{done && (
						<output className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-success/15 px-4 py-3 text-sm">
							<p className="flex min-w-0 flex-1 items-start gap-2">
								<span className="relative mt-0.5 inline-flex shrink-0">
									<DrawCheck play={justDone} className="size-4 text-success" />
									{justDone && <DoneBurst />}
								</span>
								{mode === "protect"
									? m.pdfpw_done_protect()
									: m.pdfpw_done_unlock()}
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => downloadBlob(done.blob, done.name)}
							>
								<Download />
								{m.pdfpw_download_again({ name: done.name })}
							</Button>
						</output>
					)}
				</div>
			)}
		</PageShell>
	);
}
