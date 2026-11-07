import { Eye, EyeOff } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

// One password field: a label, the input with a show/hide button, and one line
// under it that is either an error (red, announced) or a quiet hint.
//
// The browser is told not to offer to save it. This is a password for a file, not
// a login, and the tool's promise is that it is never stored.
export function PasswordField({
	id,
	label,
	value,
	onChange,
	shown,
	onToggleShown,
	error,
	hint,
	ref,
	disabled,
}: {
	readonly id: string;
	readonly label: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly shown: boolean;
	readonly onToggleShown: () => void;
	readonly error?: string;
	readonly hint?: ReactNode;
	readonly ref?: Ref<HTMLInputElement>;
	readonly disabled?: boolean;
}) {
	const noteId = `${id}-note`;
	const invalid = error !== undefined;
	const showNote = invalid || hint !== undefined;

	return (
		<div className="grid gap-1.5">
			<label htmlFor={id} className="text-sm font-semibold">
				{label}
			</label>
			<div className="relative">
				<Input
					id={id}
					ref={ref}
					type={shown ? "text" : "password"}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					disabled={disabled}
					aria-invalid={invalid || undefined}
					aria-describedby={showNote ? noteId : undefined}
					autoComplete="off"
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					data-1p-ignore
					data-lpignore="true"
					data-form-type="other"
					className="pr-11"
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="absolute top-0.5 right-0.5"
					onClick={onToggleShown}
					disabled={disabled}
					aria-label={shown ? m.pdfpw_hide_password() : m.pdfpw_show_password()}
					aria-pressed={shown}
				>
					{shown ? <EyeOff /> : <Eye />}
				</Button>
			</div>
			{showNote && (
				<p
					id={noteId}
					role={invalid ? "alert" : undefined}
					className={cn(
						"text-xs",
						invalid ? "font-medium text-destructive" : "text-muted-foreground",
					)}
				>
					{error ?? hint}
				</p>
			)}
		</div>
	);
}
