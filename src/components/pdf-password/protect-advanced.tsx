import { ChevronRight } from "lucide-react";
import { useId } from "react";

import { PasswordField } from "#/components/pdf-password/password-field.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import type { Permissions } from "#/lib/pdf-password/shapes.ts";
import { m } from "#/paraglide/messages.js";

const PERMISSIONS = [
	{ key: "print", label: () => m.pdfpw_perm_print() },
	{ key: "copy", label: () => m.pdfpw_perm_copy() },
	{ key: "edit", label: () => m.pdfpw_perm_edit() },
] as const;

// The optional part of Protect: an owner password and what readers may do. A native
// <details>, so it opens and closes with the keyboard and screen readers get its
// state for free. No height animation: it sits below the fields the person is
// typing in and moving the layout under them would only get in the way.
export function ProtectAdvanced({
	ownerPassword,
	onOwnerChange,
	permissions,
	onPermissionsChange,
	sameAsOpen,
	shown,
	onToggleShown,
	disabled,
}: {
	readonly ownerPassword: string;
	readonly onOwnerChange: (value: string) => void;
	readonly permissions: Permissions;
	readonly onPermissionsChange: (value: Permissions) => void;
	// The owner password equals the open password, so the limits would not hold.
	readonly sameAsOpen: boolean;
	readonly shown: boolean;
	readonly onToggleShown: () => void;
	readonly disabled: boolean;
}) {
	const id = useId();
	// A limit only holds against someone who cannot become the owner, so the
	// switches wait for an owner password.
	const hasOwner = ownerPassword !== "";

	return (
		<details className="group rounded-lg border bg-card">
			<summary className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold select-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
				<ChevronRight
					aria-hidden
					className="size-4 transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none"
				/>
				{m.pdfpw_advanced()}
			</summary>
			<div className="grid gap-4 px-4 pb-4">
				<PasswordField
					id={`${id}-owner`}
					label={m.pdfpw_owner_label()}
					value={ownerPassword}
					onChange={onOwnerChange}
					shown={shown}
					onToggleShown={onToggleShown}
					disabled={disabled}
					hint={sameAsOpen ? m.pdfpw_owner_same() : m.pdfpw_owner_hint()}
				/>
				<fieldset className="grid gap-2" disabled={disabled || !hasOwner}>
					<legend className="mb-1 text-sm font-semibold">
						{m.pdfpw_perm_legend()}
					</legend>
					{PERMISSIONS.map(({ key, label }) => (
						<div key={key} className="flex items-center gap-2">
							<Checkbox
								id={`${id}-${key}`}
								checked={permissions[key]}
								disabled={disabled || !hasOwner}
								onCheckedChange={(on) =>
									onPermissionsChange({ ...permissions, [key]: on })
								}
							/>
							<label
								htmlFor={`${id}-${key}`}
								className={
									hasOwner ? "text-sm" : "text-sm text-muted-foreground"
								}
							>
								{label()}
							</label>
						</div>
					))}
					<p className="text-xs text-muted-foreground">
						{hasOwner ? m.pdfpw_perm_advisory() : m.pdfpw_perm_needs_owner()}
					</p>
				</fieldset>
			</div>
		</details>
	);
}
