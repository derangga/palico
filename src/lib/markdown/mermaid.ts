import { Effect, Option, Ref } from "effect";

import { MermaidLoadError, MermaidRenderError } from "./errors.ts";

type MermaidApi = typeof import("mermaid").default;

// mermaid is a heavy dependency, so `import("mermaid")` keeps it in its own
// async chunk that's only fetched the first time a diagram actually renders —
// the same lazy-load approach as video/engine.ts and background-removal.ts.
// `securityLevel: "strict"` makes mermaid sanitize its own SVG output —
// important since the diagram source is untrusted user input we inject via
// dangerouslySetInnerHTML.
//
// Success-only module memo held in a Ref (mirroring the modelRef in
// background-removal.ts) rather than a mutable `let`: the initialized API is
// cached across renders, while a failed load never reaches Ref.set and so can
// be retried on the next diagram.
const mermaidRef = Ref.unsafeMake<Option.Option<MermaidApi>>(Option.none());

const loadMermaid: Effect.Effect<MermaidApi, MermaidLoadError> = Effect.gen(
	function* () {
		const cached = yield* Ref.get(mermaidRef);
		if (Option.isSome(cached)) return cached.value;

		const mod = yield* Effect.tryPromise({
			try: () => import("mermaid"),
			catch: (cause) =>
				new MermaidLoadError({
					message:
						cause instanceof Error
							? cause.message
							: "Couldn't load the diagram renderer.",
				}),
		});

		const api = mod.default;
		const isDark =
			typeof document !== "undefined" &&
			document.documentElement.classList.contains("dark");
		api.initialize({
			startOnLoad: false,
			securityLevel: "strict",
			theme: isDark ? "dark" : "default",
		});
		yield* Ref.set(mermaidRef, Option.some(api));
		return api;
	},
);

// Render mermaid source to an SVG string. Parse/validation failures (the usual
// case mid-typing) land on the error channel as MermaidRenderError so the view
// can show an inline error in place of just this diagram.
export const renderMermaid = (
	id: string,
	source: string,
): Effect.Effect<string, MermaidLoadError | MermaidRenderError> =>
	Effect.gen(function* () {
		const api = yield* loadMermaid;
		const { svg } = yield* Effect.tryPromise({
			try: () => api.render(id, source),
			catch: (cause) =>
				new MermaidRenderError({
					message:
						cause instanceof Error
							? cause.message
							: "This diagram couldn't be rendered.",
				}),
		});
		return svg;
	});
