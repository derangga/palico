import { Collapsible } from "@base-ui/react/collapsible";
import {
	ChevronDown,
	CircleAlert,
	CircleCheck,
	Eye,
	EyeOff,
	TriangleAlert,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
	useJwtVerification,
	type Verification,
} from "#/hooks/use-jwt-verification.ts";
import type { AlgorithmReading } from "#/lib/jwt/algorithms.ts";
import { keyKindOf } from "#/lib/jwt/algorithms.ts";
import { EXAMPLE_SIGNING_INPUT } from "#/lib/jwt/example.ts";
import type { DecodedToken } from "#/lib/jwt/token.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

import { type ColoredPart, PART_STYLE } from "./parts.ts";
import { StatusChip, type Tone } from "./status-chip.tsx";

interface Chip {
	readonly tone: Tone;
	readonly label: string;
}

function chipFor(
	algorithm: AlgorithmReading,
	verification: Verification,
): Chip {
	if (algorithm.kind === "none") {
		return { tone: "warning", label: m.jwt_sig_none() };
	}

	if (algorithm.kind === "unsupported") {
		return { tone: "neutral", label: m.jwt_sig_unsupported() };
	}

	switch (verification.kind) {
		case "verified":
			return { tone: "success", label: m.jwt_sig_verified() };
		case "not-verified":
			return { tone: "danger", label: m.jwt_sig_failed() };
		case "checking":
			return { tone: "neutral", label: m.jwt_sig_checking() };
		case "idle":
		case "key-error":
		case "failed":
			return { tone: "neutral", label: m.jwt_sig_unchecked() };
	}
}

const NOTICE_TONES = {
	success: { box: "bg-success/15", icon: "text-success", Icon: CircleCheck },
	warning: { box: "bg-warning/20", icon: "text-warning", Icon: TriangleAlert },
	danger: {
		box: "bg-destructive/10",
		icon: "text-destructive",
		Icon: CircleAlert,
	},
} as const;

function Notice({
	tone,
	title,
	children,
}: {
	readonly tone: keyof typeof NOTICE_TONES;
	readonly title?: string;
	readonly children: ReactNode;
}) {
	const { box, icon, Icon } = NOTICE_TONES[tone];

	return (
		<div className={cn("flex items-start gap-2.5 rounded-md p-3 text-sm", box)}>
			<Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", icon)} />
			<div className="flex min-w-0 flex-col gap-1">
				{title && <p className="font-semibold">{title}</p>}
				<p className="text-pretty break-words">{children}</p>
			</div>
		</div>
	);
}

function Result({ verification }: { readonly verification: Verification }) {
	switch (verification.kind) {
		case "verified":
			return <Notice tone="success">{m.jwt_result_verified()}</Notice>;
		case "not-verified":
			return <Notice tone="danger">{m.jwt_result_failed()}</Notice>;
		case "key-error":
			return (
				<Notice tone="danger" title={m.jwt_key_error_title()}>
					{verification.error.message}
				</Notice>
			);
		case "failed":
			return <Notice tone="danger">{m.jwt_err_verify_failed()}</Notice>;
		case "idle":
		case "checking":
			return null;
	}
}

/**
 * Checks the signature. It is collapsed until asked for, and its chip always shows
 * where the check stands, so an unchecked token is never mistaken for a good one.
 * The key typed here lives in this page's state only.
 */
export function VerifyCard({
	token,
	algorithm,
	secret,
	onSecret,
	secretIsBase64,
	onSecretIsBase64,
	publicKey,
	onPublicKey,
	active,
	onActive,
}: {
	readonly token: DecodedToken;
	readonly algorithm: AlgorithmReading;
	readonly secret: string;
	readonly onSecret: (text: string) => void;
	readonly secretIsBase64: boolean;
	readonly onSecretIsBase64: (on: boolean) => void;
	readonly publicKey: string;
	readonly onPublicKey: (text: string) => void;
	readonly active: ColoredPart | undefined;
	readonly onActive: (part: ColoredPart | undefined) => void;
}) {
	const [open, setOpen] = useState(false);
	const [showSecret, setShowSecret] = useState(false);
	const secretId = useId();
	const keyId = useId();
	const base64Id = useId();

	const keyKind =
		algorithm.kind === "supported" ? keyKindOf(algorithm.spec) : undefined;

	const verification = useJwtVerification(
		token,
		keyKind,
		keyKind === "secret" ? secret : publicKey,
		secretIsBase64,
	);

	const chip = chipFor(algorithm, verification);
	const isExample = token.signingInput === EXAMPLE_SIGNING_INPUT;

	return (
		<section
			aria-label={m.jwt_verify_title()}
			data-active={active === "signature" || undefined}
			className="rounded-xl border bg-card p-4 shadow-sm transition-[border-color,box-shadow] duration-150 ease-out data-[active]:border-ring data-[active]:ring-3 data-[active]:ring-ring/40 sm:p-5"
			onPointerEnter={() => onActive("signature")}
			onPointerLeave={() => onActive(undefined)}
		>
			<Collapsible.Root open={open} onOpenChange={setOpen}>
				<div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-semibold">
						<Collapsible.Trigger className="-ml-1.5 flex min-h-11 items-center gap-2 rounded-md px-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-9">
							<span
								aria-hidden
								className={cn(
									"size-2.5 rounded-full",
									PART_STYLE.signature.dot,
								)}
							/>
							{m.jwt_verify_title()}
							<ChevronDown
								aria-hidden
								className={cn(
									"size-4 transition-transform duration-200 ease-out motion-reduce:transition-none",
									open && "rotate-180",
								)}
							/>
						</Collapsible.Trigger>
					</h2>
					<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
				</div>

				<Collapsible.Panel className="flex flex-col gap-3 pt-3">
					{token.alg !== undefined && (
						<p className="text-sm text-muted-foreground">
							{m.jwt_verify_algorithm({ alg: token.alg })}
						</p>
					)}

					{algorithm.kind === "none" && (
						<Notice tone="warning" title={m.jwt_none_title()}>
							{m.jwt_none_body()}
						</Notice>
					)}

					{algorithm.kind === "unsupported" && (
						<Notice tone="warning">{algorithm.error.message}</Notice>
					)}

					{keyKind === "secret" && (
						<div className="flex flex-col gap-2.5">
							<label htmlFor={secretId} className="text-sm font-medium">
								{m.jwt_secret_label()}
							</label>
							<div className="flex items-center gap-1.5">
								<Input
									id={secretId}
									type="text"
									value={secret}
									onChange={(event) => onSecret(event.target.value)}
									placeholder={m.jwt_secret_placeholder()}
									spellCheck={false}
									autoCapitalize="off"
									autoCorrect="off"
									autoComplete="off"
									// A password manager must not offer to save a secret that is typed here.
									data-1p-ignore
									data-lpignore="true"
									data-bwignore
									data-form-type="other"
									className={cn(
										"max-sm:h-11 max-sm:text-base",
										!showSecret && "[-webkit-text-security:disc]",
									)}
								/>
								<Button
									variant="outline"
									size="icon"
									className="max-sm:size-11"
									aria-label={
										showSecret ? m.jwt_secret_hide() : m.jwt_secret_show()
									}
									onClick={() => setShowSecret(!showSecret)}
								>
									{showSecret ? <EyeOff /> : <Eye />}
								</Button>
							</div>
							<label
								htmlFor={base64Id}
								className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium sm:min-h-9"
							>
								<Checkbox
									id={base64Id}
									checked={secretIsBase64}
									onCheckedChange={onSecretIsBase64}
								/>
								{m.jwt_secret_base64()}
							</label>
							{isExample && (
								<p className="text-xs text-muted-foreground">
									{m.jwt_example_hint()}
								</p>
							)}
						</div>
					)}

					{keyKind === "public" && (
						<div className="flex flex-col gap-2.5">
							<label htmlFor={keyId} className="text-sm font-medium">
								{m.jwt_key_label()}
							</label>
							<Textarea
								id={keyId}
								value={publicKey}
								onChange={(event) => onPublicKey(event.target.value)}
								placeholder={m.jwt_key_placeholder()}
								spellCheck={false}
								autoCapitalize="off"
								autoCorrect="off"
								autoComplete="off"
								wrap="off"
								className="h-32 resize-none overflow-auto field-sizing-fixed font-mono whitespace-pre"
							/>
							<p className="text-xs text-muted-foreground">
								{m.jwt_key_hint()}
							</p>
						</div>
					)}

					{keyKind && (
						<p className="text-xs text-muted-foreground">
							{m.jwt_verify_private()}
						</p>
					)}

					<Result verification={verification} />
				</Collapsible.Panel>
			</Collapsible.Root>
		</section>
	);
}
