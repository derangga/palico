import { Loader2, LockOpen, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { useJustDone } from "#/components/done-burst.tsx";
import { BlockedNote } from "#/components/pdf-password/blocked-note.tsx";
import { DoneCard } from "#/components/pdf-password/done-card.tsx";
import { PasswordField } from "#/components/pdf-password/password-field.tsx";
import { usePasswordJob } from "#/components/pdf-password/use-password-job.ts";
import { Button } from "#/components/ui/button.tsx";
import { runUnlock } from "#/lib/pdf-password/outcome.ts";
import { m } from "#/paraglide/messages.js";

// The Unlock half of the tool: the password that opens the file. It owns the typed
// password, so leaving the mode throws it away.
export function UnlockForm({
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
	const [shown, setShown] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);

	const job = usePasswordJob({ working, onWorkingChange, onEngineError });
	const { done, fieldError, blocked } = job;
	const justDone = useJustDone(done !== undefined);

	// After a wrong password, put the cursor back in the field with its text
	// selected so a retry replaces it.
	useEffect(() => {
		if (!fieldError) return;

		inputRef.current?.focus();
		inputRef.current?.select();
	}, [fieldError]);

	function submit(event: FormEvent) {
		event.preventDefault();

		void job.run(runUnlock(file, password), () => setPassword(""));
	}

	return (
		<>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<div className="grid gap-4">
					<p className="flex items-start gap-2 text-sm text-muted-foreground">
						<ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
						{m.pdfpw_unlock_notice()}
					</p>
					<PasswordField
						id="pdfpw-unlock"
						ref={inputRef}
						label={m.pdfpw_unlock_label()}
						value={password}
						onChange={(value) => {
							setPassword(value);
							job.clearOutcome();
						}}
						shown={shown}
						onToggleShown={() => setShown((on) => !on)}
						disabled={working}
						error={fieldError?.message}
						hint={m.pdfpw_unlock_hint()}
					/>
				</div>

				{blocked && <BlockedNote message={blocked} />}

				<div className="flex flex-wrap items-center gap-3">
					<Button type="submit" disabled={working}>
						{working ? <Loader2 className="animate-spin" /> : <LockOpen />}
						{working ? m.pdfpw_working() : m.pdfpw_run_unlock()}
					</Button>
					<p className="min-w-0 flex-1 text-xs text-muted-foreground">
						{m.pdfpw_privacy()}
					</p>
				</div>
			</form>

			{done && (
				<DoneCard
					message={m.pdfpw_done_unlock()}
					blob={done.blob}
					name={done.name}
					play={justDone}
					sendable
				/>
			)}
		</>
	);
}
