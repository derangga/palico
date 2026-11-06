import type { ReactNode } from "react";

import type {
	ClaimsReading,
	TextClaim,
	TextReading,
	TimeClaim,
	TimeReading,
	Window,
} from "#/lib/jwt/claims.ts";
import { formatMoment, noteFor } from "#/lib/jwt/time.ts";
import { m } from "#/paraglide/messages.js";

import { StatusChip, type Tone } from "./status-chip.tsx";

const CLAIM_LABEL: Record<TimeClaim | TextClaim, () => string> = {
	exp: () => m.jwt_claim_exp(),
	nbf: () => m.jwt_claim_nbf(),
	iat: () => m.jwt_claim_iat(),
	iss: () => m.jwt_claim_iss(),
	sub: () => m.jwt_claim_sub(),
	aud: () => m.jwt_claim_aud(),
	jti: () => m.jwt_claim_jti(),
};

// The window is about time only. It says nothing about the signature, so it is
// never green: green is kept for a signature that has been checked.
const WINDOW: Record<
	Window,
	{ readonly tone: Tone; readonly label: () => string }
> = {
	valid: { tone: "info", label: () => m.jwt_window_valid() },
	expired: { tone: "warning", label: () => m.jwt_window_expired() },
	"not-yet": { tone: "warning", label: () => m.jwt_window_not_yet() },
	none: { tone: "neutral", label: () => m.jwt_window_none() },
	unreadable: { tone: "neutral", label: () => m.jwt_window_unreadable() },
};

function Row({
	claim,
	children,
}: {
	readonly claim: TimeClaim | TextClaim;
	readonly children: ReactNode;
}) {
	return (
		<div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-3">
			<dt className="flex items-baseline gap-2 sm:flex-col sm:gap-0">
				<span className="text-sm font-medium">{CLAIM_LABEL[claim]()}</span>
				<code className="font-mono text-xs text-muted-foreground">{claim}</code>
			</dt>
			<dd className="flex min-w-0 flex-col gap-0.5">{children}</dd>
		</div>
	);
}

function TimeRow({
	reading,
	now,
}: {
	readonly reading: TimeReading;
	readonly now: number;
}) {
	if (reading.kind === "invalid") {
		return (
			<Row claim={reading.claim}>
				<p className="font-mono text-[0.8125rem] break-all">{reading.raw}</p>
				<p className="text-xs text-muted-foreground">
					{m.jwt_time_invalid({ value: reading.raw })}
				</p>
			</Row>
		);
	}

	const local = formatMoment(reading.millis, "local");
	const utc = formatMoment(reading.millis, "utc");

	return (
		<Row claim={reading.claim}>
			<p className="text-sm font-medium">
				{noteFor(reading.claim, now, reading.millis)}
			</p>
			<p className="text-sm">
				{local}
				<span className="ml-2 text-xs text-muted-foreground">
					{local === utc ? m.jwt_zone_utc() : m.jwt_zone_local()}
				</span>
			</p>
			{local !== utc && (
				<p className="text-sm">
					{utc}
					<span className="ml-2 text-xs text-muted-foreground">
						{m.jwt_zone_utc()}
					</span>
				</p>
			)}
		</Row>
	);
}

function TextRow({ reading }: { readonly reading: TextReading }) {
	return (
		<Row claim={reading.claim}>
			{reading.values.map((value, index) => (
				// A list can repeat a value, and its order is the only identity an item has.
				// oxlint-disable-next-line react/no-array-index-key
				<p key={index} className="font-mono text-[0.8125rem] break-all">
					{value}
				</p>
			))}
		</Row>
	);
}

/** The registered claims in plain language, with the time window at the top. */
export function ClaimsCard({
	claims,
	window,
	now,
}: {
	/** Undefined when the payload is not an object. */
	readonly claims: ClaimsReading | undefined;
	readonly window: Window | undefined;
	readonly now: number;
}) {
	const empty = claims && claims.times.length + claims.texts.length === 0;

	return (
		<section
			aria-label={m.jwt_claims_title()}
			className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
		>
			<div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
				<h2 className="text-sm font-semibold">{m.jwt_claims_title()}</h2>
				{window && (
					<StatusChip tone={WINDOW[window].tone}>
						{WINDOW[window].label()}
					</StatusChip>
				)}
			</div>

			{!claims ? (
				<p className="text-sm text-muted-foreground">
					{m.jwt_payload_not_object()}
				</p>
			) : empty ? (
				<p className="text-sm text-muted-foreground">{m.jwt_claims_empty()}</p>
			) : (
				<dl className="flex flex-col divide-y divide-border">
					{claims.times.map((reading) => (
						<TimeRow key={reading.claim} reading={reading} now={now} />
					))}
					{claims.texts.map((reading) => (
						<TextRow key={reading.claim} reading={reading} />
					))}
				</dl>
			)}
		</section>
	);
}
