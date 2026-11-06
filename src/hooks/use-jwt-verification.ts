import { Effect, Fiber } from "effect";
import { useEffect, useState } from "react";

import type { InvalidKeyError } from "#/lib/jwt/errors.ts";
import type { KeyInput } from "#/lib/jwt/keys.ts";
import type { DecodedToken } from "#/lib/jwt/token.ts";
import { verifyToken } from "#/lib/jwt/verify.ts";

export type Verification =
	| { readonly kind: "idle" }
	| { readonly kind: "checking" }
	| { readonly kind: "verified" }
	| { readonly kind: "not-verified" }
	| { readonly kind: "key-error"; readonly error: InvalidKeyError }
	| { readonly kind: "failed" };

const IDLE: Verification = { kind: "idle" };
const CHECKING: Verification = { kind: "checking" };
const FAILED: Verification = { kind: "failed" };

/**
 * Checks `token` against the key typed so far. Nothing runs until there is
 * something typed. A check that is no longer wanted is interrupted, and its
 * result is dropped, so a slow check can never overwrite a newer one. While a
 * new check runs the answer is `checking`, never the old result for a changed
 * token or key.
 */
export function useJwtVerification(
	token: DecodedToken | undefined,
	kind: KeyInput["kind"] | undefined,
	text: string,
	base64url: boolean,
): Verification {
	const [settled, setSettled] = useState<
		{ readonly run: string; readonly verification: Verification } | undefined
	>();

	const run =
		token && kind && text.trim() !== ""
			? JSON.stringify([token.parts, kind, text, base64url])
			: undefined;

	useEffect(() => {
		if (!token || !kind || run === undefined) return;

		const input: KeyInput =
			kind === "secret" ? { kind, text, base64url } : { kind, text };

		const fiber = Effect.runFork(
			verifyToken(token, input).pipe(
				Effect.map((verdict): Verification => ({ kind: verdict })),
				Effect.catchTag("InvalidKeyError", (error) =>
					Effect.succeed<Verification>({ kind: "key-error", error }),
				),
				Effect.catchTag("UnsupportedAlgorithmError", () =>
					Effect.succeed(FAILED),
				),
				Effect.catchDefect(() => Effect.succeed(FAILED)),
				Effect.map((verification) => {
					setSettled({ run, verification });
				}),
			),
		);

		return () => {
			Effect.runFork(Fiber.interrupt(fiber));
		};
	}, [token, kind, text, base64url, run]);

	if (run === undefined) return IDLE;

	return settled?.run === run ? settled.verification : CHECKING;
}
