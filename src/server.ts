import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

// COOP/COEP unlock SharedArrayBuffer (crossOriginIsolated === true), which
// the upcoming video converter needs for multi-threaded ffmpeg.wasm.
// Applied to every response — Workers static-asset _headers only covers
// /favicon.ico etc., not the SSR HTML where these headers must live.
export default createServerEntry({
	async fetch(request) {
		const response = await handler.fetch(request);
		const headers = new Headers(response.headers);
		headers.set("Cross-Origin-Opener-Policy", "same-origin");
		headers.set("Cross-Origin-Embedder-Policy", "require-corp");
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	},
});
