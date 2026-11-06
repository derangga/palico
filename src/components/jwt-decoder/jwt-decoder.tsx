import { KeyRound } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { useTokenClock } from "#/hooks/use-token-clock.ts";
import { readAlgorithm } from "#/lib/jwt/algorithms.ts";
import { boundariesOf, readClaims, windowAt } from "#/lib/jwt/claims.ts";
import { EXAMPLE_TOKEN } from "#/lib/jwt/example.ts";
import { faultOf, partsOf, readToken } from "#/lib/jwt/token.ts";
import { m } from "#/paraglide/messages.js";

import { ClaimsCard } from "./claims-card.tsx";
import { ErrorPanel } from "./error-panel.tsx";
import { PartCard } from "./part-card.tsx";
import { type ColoredPart } from "./parts.ts";
import { TokenInput } from "./token-input.tsx";
import { VerifyCard } from "./verify-card.tsx";

const NO_BOUNDARIES: ReadonlyArray<number> = [];

/**
 * Nothing here is written anywhere. The token, the secret and the key are React
 * state, so a reload or leaving the page drops them. They never reach the URL,
 * storage or the service worker.
 */
export function JwtDecoder() {
	const [text, setText] = useState("");
	const [secret, setSecret] = useState("");
	const [secretIsBase64, setSecretIsBase64] = useState(false);
	const [publicKey, setPublicKey] = useState("");
	const [active, setActive] = useState<ColoredPart | undefined>();

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const errorId = useId();

	const reading = useMemo(() => readToken(text), [text]);
	const token = reading.kind === "ok" ? reading.token : undefined;

	const claims = useMemo(
		() => (token ? readClaims(token.payload) : undefined),
		[token],
	);

	const algorithm = useMemo(
		() => (token ? readAlgorithm(token.alg) : undefined),
		[token],
	);

	const now = useTokenClock(
		claims ? boundariesOf(claims.times) : NO_BOUNDARIES,
	);

	const timeWindow = claims ? windowAt(claims.times, now) : undefined;

	function edit(next: string) {
		setText(next);
		setActive(undefined);
	}

	function clear() {
		// Clear forgets everything typed on the page, the key included.
		edit("");
		setSecret("");
		setSecretIsBase64(false);
		setPublicKey("");
		textareaRef.current?.focus();
	}

	return (
		<PageShell width="wide">
			<PageHeader title={m.tool_jwt_decoder_label()}>
				{m.jwt_header_desc()}
			</PageHeader>

			<div className="flex flex-col gap-4">
				<TokenInput
					text={text}
					onTextChange={edit}
					onClear={clear}
					onExample={() => edit(EXAMPLE_TOKEN)}
					textareaRef={textareaRef}
					parts={partsOf(reading)}
					fault={faultOf(reading)}
					active={active}
					onActive={setActive}
					invalid={reading.kind === "error"}
					describedBy={errorId}
				/>

				{reading.kind === "empty" && (
					<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-input p-8 text-center">
						<KeyRound aria-hidden className="size-8 text-muted-foreground" />
						<div className="flex max-w-xs flex-col gap-1">
							<p className="text-sm font-semibold">{m.jwt_empty_title()}</p>
							<p className="text-sm text-pretty text-muted-foreground">
								{m.jwt_empty_body()}
							</p>
						</div>
					</div>
				)}

				{reading.kind === "error" && (
					<ErrorPanel error={reading.error} id={errorId} />
				)}

				{token && algorithm && (
					<div className="grid items-start gap-4 md:grid-cols-2">
						<div className="flex flex-col gap-4">
							<PartCard
								part="header"
								text={token.headerText}
								active={active}
								onActive={setActive}
							/>
							<PartCard
								part="payload"
								text={token.payloadText}
								active={active}
								onActive={setActive}
							/>
						</div>

						<div className="flex flex-col gap-4">
							<ClaimsCard claims={claims} window={timeWindow} now={now} />
							<VerifyCard
								token={token}
								algorithm={algorithm}
								secret={secret}
								onSecret={setSecret}
								secretIsBase64={secretIsBase64}
								onSecretIsBase64={setSecretIsBase64}
								publicKey={publicKey}
								onPublicKey={setPublicKey}
								active={active}
								onActive={setActive}
							/>
						</div>
					</div>
				)}
			</div>
		</PageShell>
	);
}
