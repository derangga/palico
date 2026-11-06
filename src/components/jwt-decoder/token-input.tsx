import { Lock, X } from "lucide-react";
import { Fragment, type RefObject } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { FaultPart } from "#/lib/jwt/errors.ts";
import type { Parts } from "#/lib/jwt/token.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

import { type ColoredPart, PART_STYLE, PARTS } from "./parts.ts";

/**
 * The box a token is pasted into, a line saying it never leaves the browser, and
 * the token drawn in its three colours. The textarea stays plain: colouring text
 * inside one needs an overlay that drifts on scroll, wrapping and IME input.
 */
export function TokenInput({
	text,
	onTextChange,
	onClear,
	onExample,
	textareaRef,
	parts,
	fault,
	active,
	onActive,
	invalid,
	describedBy,
}: {
	readonly text: string;
	readonly onTextChange: (text: string) => void;
	readonly onClear: () => void;
	readonly onExample: () => void;
	readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
	/** The three parts of what is typed, when there are three. */
	readonly parts: Parts | undefined;
	/** The part an error points at, marked in the token. */
	readonly fault: FaultPart | undefined;
	readonly active: ColoredPart | undefined;
	readonly onActive: (part: ColoredPart | undefined) => void;
	readonly invalid: boolean;
	readonly describedBy: string | undefined;
}) {
	return (
		<section
			aria-label={m.jwt_input_title()}
			className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
		>
			<div className="flex min-h-9 items-center justify-between gap-2">
				<label htmlFor="jwt-token" className="text-sm font-semibold">
					{m.jwt_input_label()}
				</label>
				<div className="flex items-center gap-1.5">
					{text === "" ? (
						<Button
							variant="outline"
							className="max-sm:h-11"
							onClick={onExample}
						>
							{m.jwt_try_example()}
						</Button>
					) : (
						<Button variant="ghost" className="max-sm:h-11" onClick={onClear}>
							<X />
							{m.common_clear()}
						</Button>
					)}
				</div>
			</div>

			<Textarea
				id="jwt-token"
				ref={textareaRef}
				value={text}
				onChange={(event) => onTextChange(event.target.value)}
				placeholder={m.jwt_input_placeholder()}
				aria-invalid={invalid || undefined}
				aria-describedby={invalid ? describedBy : undefined}
				spellCheck={false}
				autoCapitalize="off"
				autoCorrect="off"
				autoComplete="off"
				className="h-28 resize-none overflow-auto field-sizing-fixed font-mono break-all md:h-32"
			/>

			<p className="flex items-start gap-2 text-xs text-muted-foreground">
				<Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
				{m.jwt_privacy()}
			</p>

			{parts && (
				<div
					// The same text as the box above, so a screen reader skips it.
					aria-hidden
					className="rounded-md border border-input bg-background p-3 font-mono text-[0.8125rem] leading-6 break-all"
				>
					{PARTS.map((part, index) => (
						<Fragment key={part}>
							{index > 0 && <span className="text-muted-foreground">.</span>}
							{/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- decorative link to the card. The labels and the card titles name the same part without a pointer. */}
							<span
								className={cn(
									"rounded-sm px-0.5 transition-colors duration-150 ease-out",
									active === part
										? PART_STYLE[part].strong
										: PART_STYLE[part].tint,
									fault === part &&
										"underline decoration-destructive decoration-wavy decoration-2 underline-offset-4",
								)}
								onPointerEnter={() => onActive(part)}
								onPointerLeave={() => onActive(undefined)}
								onClick={() => onActive(part)}
							>
								{parts[index]}
							</span>
						</Fragment>
					))}
				</div>
			)}
		</section>
	);
}
