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

// Monotonic counter so every render() call gets a unique DOM id. mermaid stages
// each render in a temp <div id={id}> and removes it afterward; if two concurrent
// renders shared one id, the newer one would delete the older's temp element
// mid-flight and corrupt the surviving SVG.
const renderSeq = Ref.unsafeMake(0);

// Apply config from the *current* theme. Called on every render (not just first
// load) so toggling dark mode re-themes diagrams instead of baking the theme
// into the memoized init. `suppressErrorRendering` stops mermaid from painting
// its error-bomb SVG into document.body on parse failure (the normal mid-typing
// state) — we surface failures inline via the error channel instead.
const applyConfig = (api: MermaidApi): void => {
	const isDark =
		typeof document !== "undefined" &&
		document.documentElement.classList.contains("dark");
	api.initialize({
		startOnLoad: false,
		securityLevel: "strict",
		suppressErrorRendering: true,
		theme: isDark ? "dark" : "default",
	});
};

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
		applyConfig(api);
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
		// Re-apply config each render so a live theme change takes effect.
		applyConfig(api);
		// Unique id per invocation, keyed off the caller's id for debuggability.
		const seq = yield* Ref.updateAndGet(renderSeq, (n) => n + 1);
		const uniqueId = `${id}-${seq}`;
		const { svg } = yield* Effect.tryPromise({
			try: () => api.render(uniqueId, source),
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
