// Cross-origin isolation headers, stamped by the service worker on every
// same-origin response it serves. Must match public/_headers; the parity test in
// isolation-headers.test.ts fails when they drift. Pure (no Effect, no DOM) so the
// worker bundle stays small and Vitest can run it in node.

export const DOCUMENT_ISOLATION_HEADERS = {
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "require-corp",
} as const;

// Built workers and the vendored ZetaOffice runtime load into the isolated
// document, so they need CORP (COEP comes from the document rule).
export const RESOURCE_POLICY_PREFIXES = ["/assets/", "/vendor/"] as const;
export const RESOURCE_POLICY_HEADER = [
	"Cross-Origin-Resource-Policy",
	"same-origin",
] as const;

// Returns a copy of `response` with the isolation headers set. Opaque responses
// cannot be copied, and they never occur for same-origin GETs.
export const stampIsolationHeaders = (
	url: URL,
	response: Response,
): Response => {
	if (response.type === "opaque" || response.status === 0) return response;
	const headers = new Headers(response.headers);
	for (const [name, value] of Object.entries(DOCUMENT_ISOLATION_HEADERS)) {
		headers.set(name, value);
	}
	if (RESOURCE_POLICY_PREFIXES.some((p) => url.pathname.startsWith(p))) {
		headers.set(RESOURCE_POLICY_HEADER[0], RESOURCE_POLICY_HEADER[1]);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};
