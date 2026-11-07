import { Lock, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { useJustDone } from "#/components/done-burst.tsx";
import { BlockedNote } from "#/components/pdf-password/blocked-note.tsx";
import { DoneCard } from "#/components/pdf-password/done-card.tsx";
import { PasswordField } from "#/components/pdf-password/password-field.tsx";
import { ProtectAdvanced } from "#/components/pdf-password/protect-advanced.tsx";
import { usePasswordJob } from "#/components/pdf-password/use-password-job.ts";
import { Button } from "#/components/ui/button.tsx";
import { runProtect } from "#/lib/pdf-password/outcome.ts";
import { ALL_ALLOWED, type Permissions } from "#/lib/pdf-password/shapes.ts";
import { passwordStrength } from "#/lib/pdf-password/strength.ts";
import { m } from "#/paraglide/messages.js";

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

// The Lock half of the tool: a password twice, and optionally an owner password with
// permissions. It owns the typed passwords, so leaving the mode throws them away.
export function LockForm({
	file,
	working,
	onWorkingChange,
	onEngineError,
}: {
	readonly file: File;
	readonly working: boolean;
	readonly onWorkingChange: (working: boolean) => void;
	readonly onEngineError: (message: string) => void;
}) {
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [ownerPassword, setOwnerPassword] = useState("");
	const [permissions, setPermissions] = useState<Permissions>(ALL_ALLOWED);
	const [shown, setShown] = useState(false);

	const passwordRef = useRef<HTMLInputElement>(null);
	const confirmRef = useRef<HTMLInputElement>(null);

	const job = usePasswordJob({ working, onWorkingChange, onEngineError });
	const { done, fieldError, blocked } = job;
	const justDone = useJustDone(done !== undefined);

	// After an empty or mismatched password, put the cursor back in the field that
	// needs fixing, with its text selected so a retry replaces it.
	useEffect(() => {
		if (!fieldError) return;

		const input =
			fieldError.field === "confirm" ? confirmRef.current : passwordRef.current;

		input?.focus();
		input?.select();
	}, [fieldError]);

	function clearPasswords() {
		setPassword("");
		setConfirm("");
		setOwnerPassword("");
		setPermissions(ALL_ALLOWED);
	}

	function submit(event: FormEvent) {
		event.preventDefault();

		void job.run(
			runProtect(file, { password, confirm, ownerPassword, permissions }),
			clearPasswords,
		);
	}

	const mismatch = confirm !== "" && confirm !== password;

	const passwordError =
		fieldError?.field === "password" ? fieldError.message : undefined;

	const confirmError = mismatch
		? m.pdfpw_error_mismatch()
		: fieldError?.field === "confirm"
			? fieldError.message
			: undefined;

	const toggleShown = () => setShown((on) => !on);

	return (
		<>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<div className="grid gap-4">
					<PasswordField
						id="pdfpw-password"
						ref={passwordRef}
						label={m.pdfpw_password_label()}
						value={password}
						onChange={(value) => {
							setPassword(value);
							job.clearOutcome();
						}}
						shown={shown}
						onToggleShown={toggleShown}
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
							job.clearOutcome();
						}}
						shown={shown}
						onToggleShown={toggleShown}
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
					sameAsOpen={ownerPassword !== "" && ownerPassword === password}
					shown={shown}
					onToggleShown={toggleShown}
					disabled={working}
				/>
				<p className="text-xs text-muted-foreground">
					{m.pdfpw_forget_warning()}
				</p>

				{blocked && <BlockedNote message={blocked} />}

				<div className="flex flex-wrap items-center gap-3">
					<Button type="submit" disabled={working}>
						{working ? <Loader2 className="animate-spin" /> : <Lock />}
						{working ? m.pdfpw_working() : m.pdfpw_run_protect()}
					</Button>
					<p className="min-w-0 flex-1 text-xs text-muted-foreground">
						{m.pdfpw_privacy()}
					</p>
				</div>
			</form>

			{done && (
				<DoneCard
					message={m.pdfpw_done_protect()}
					blob={done.blob}
					name={done.name}
					play={justDone}
					sendable={false}
				/>
			)}
		</>
	);
}
