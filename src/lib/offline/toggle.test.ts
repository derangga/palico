import { Effect, Fiber, Layer, SubscriptionRef } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFakeCache, makeFakeStorage, makeFakeSw, settle } from "./fakes.ts";
import { guardedEngineLoad } from "./gate.ts";
import { type CacheHost, type ServiceWorkerHost } from "./hosts.ts";
import { startOffline } from "./register.ts";
import { ShellState } from "./shapes.ts";
import {
	reloadNeededRef,
	resetOfflineState,
	shellRef,
	updateRef,
} from "./state.ts";
import { requestOffline, stopOffline } from "./toggle.ts";

beforeEach(() => Effect.runSync(resetOfflineState));

afterEach(() => vi.unstubAllGlobals());

const get = <A>(ref: SubscriptionRef.SubscriptionRef<A>) =>
	Effect.runSync(SubscriptionRef.get(ref));

const shell = () => get(shellRef)._tag;

// Runs startOffline in the background with fakes, lets it settle, then runs `check`.
const run = (
	sw: ReturnType<typeof makeFakeSw>,
	check: Effect.Effect<void, unknown, ServiceWorkerHost | CacheHost>,
	cacheNames: readonly string[] = [],
) => {
	const cache = makeFakeCache(cacheNames);

	return Effect.runPromise(
		Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(startOffline);
			yield* settle;
			yield* check;
			yield* Fiber.interrupt(fiber);

			return cache;
		}).pipe(
			Effect.provide(Layer.mergeAll(sw.layer, cache.layer, TestClock.layer())),
		),
	);
};

describe("startup without a registration", () => {
	it("sets Off and registers nothing", async () => {
		const sw = makeFakeSw({ registered: false });
		await run(sw, Effect.void);
		expect(shell()).toBe("Off");
		expect(sw.calls.register).toBe(0);
		expect(sw.calls.update).toBe(0);
	});

	it("registers and runs the normal flow when a registration exists", async () => {
		const sw = makeFakeSw({ registered: true, initial: "active" });
		await run(
			sw,
			Effect.gen(function* () {
				expect(shell()).toBe("Active");
				yield* TestClock.adjust("1 hour");
				yield* settle;
				expect(sw.calls.update).toBe(1);
			}),
		);
		expect(sw.calls.register).toBe(1);
	});

	it("registers at startup when the page runs as an installed app", async () => {
		const sw = makeFakeSw({ registered: false, standalone: true });
		await run(sw, Effect.void);
		expect(sw.calls.register).toBe(1);
		expect(shell()).toBe("Active");
	});

	it("stays Unsupported without registering when workers are missing", async () => {
		const sw = makeFakeSw({ supported: false, registered: false });
		await run(
			sw,
			Effect.gen(function* () {
				yield* requestOffline;
				yield* settle;
			}),
		);
		expect(shell()).toBe("Unsupported");
		expect(sw.calls.register).toBe(0);
	});
});

describe("requestOffline", () => {
	it("registers and goes Installing then Active", async () => {
		const sw = makeFakeSw({
			registered: false,
			initial: "installing",
			hadController: false,
		});

		await run(
			sw,
			Effect.gen(function* () {
				expect(shell()).toBe("Off");
				yield* requestOffline;
				// The pill answers before the fiber wakes.
				expect(shell()).toBe("Registering");
				yield* settle;
				expect(sw.calls.register).toBe(1);
				expect(shell()).toBe("Installing");
				sw.emit("activated");
				yield* settle;
				expect(shell()).toBe("Active");
			}),
		);
	});

	it("is a no-op while registering or already on", async () => {
		const sw = makeFakeSw({ registered: false });
		await run(
			sw,
			Effect.gen(function* () {
				yield* requestOffline;
				yield* requestOffline;
				yield* settle;
				yield* requestOffline;
				yield* settle;
				expect(sw.calls.register).toBe(1);
				expect(shell()).toBe("Active");
			}),
		);
	});

	it("registers when the app is installed", async () => {
		const sw = makeFakeSw({ registered: false });
		await run(
			sw,
			Effect.gen(function* () {
				sw.install();
				yield* settle;
				expect(sw.calls.register).toBe(1);
				expect(shell()).toBe("Active");
			}),
		);
	});

	it("can try again after a failed registration", async () => {
		const sw = makeFakeSw({ registered: false });
		await run(
			sw,
			Effect.gen(function* () {
				Effect.runSync(
					SubscriptionRef.set(
						shellRef,
						ShellState.cases.Failed.make({ message: "x" }),
					),
				);
				yield* requestOffline;
				yield* settle;
				expect(sw.calls.register).toBe(1);
			}),
		);
	});
});

describe("a failed registration", () => {
	it("shows Failed, then registers on a later request", async () => {
		const sw = makeFakeSw({ registered: false, registerFailures: 1 });
		await run(
			sw,
			Effect.gen(function* () {
				yield* requestOffline;
				yield* settle;
				expect(shell()).toBe("Failed");
				expect(sw.calls.register).toBe(1);
				expect(sw.isRegistered()).toBe(false);
				yield* requestOffline;
				yield* settle;
				expect(sw.calls.register).toBe(2);
				expect(shell()).toBe("Active");
			}),
		);
	});
});

describe("engine download", () => {
	it("does not turn offline on for an engine that was already saved", async () => {
		vi.stubGlobal("caches", {
			open: async () => ({ match: async () => new Response("x") }),
		});
		const sw = makeFakeSw({ registered: false });
		const storage = makeFakeStorage({});

		await run(
			sw,
			Effect.gen(function* () {
				yield* guardedEngineLoad("ffmpeg", Effect.void).pipe(
					Effect.provide(storage.layer),
				);
				yield* settle;
				expect(sw.calls.register).toBe(0);
				expect(shell()).toBe("Off");
			}),
		);
	});

	it("turns offline on after the download", async () => {
		const sw = makeFakeSw({ registered: false });
		const storage = makeFakeStorage({});

		await run(
			sw,
			Effect.gen(function* () {
				expect(shell()).toBe("Off");
				yield* guardedEngineLoad("ffmpeg", Effect.void).pipe(
					Effect.provide(storage.layer),
				);
				yield* settle;
				expect(sw.calls.register).toBe(1);
				expect(shell()).toBe("Active");
			}),
		);
	});
});

describe("stopOffline", () => {
	const caches = [
		"workbox-precache-v2-https://palico.test/",
		"ffmpeg-wasm-v0.12.10",
		"zetaoffice-wasm-free",
		"palico-qpdf-v0.3.1",
		"palico-model-v1",
		"palico-ort-v1",
	];

	it("unregisters, deletes only precache buckets and goes Off", async () => {
		const sw = makeFakeSw({ registered: true });

		const cache = await run(
			sw,
			Effect.gen(function* () {
				expect(shell()).toBe("Active");
				Effect.runSync(SubscriptionRef.set(updateRef, "waiting"));
				yield* stopOffline;
				yield* settle;
				expect(shell()).toBe("Off");
				expect(get(updateRef)).toBe("idle");
				expect(sw.calls.unregister).toBe(1);
				expect(sw.isRegistered()).toBe(false);
			}),
			caches,
		);

		expect([...cache.names]).toEqual([
			"ffmpeg-wasm-v0.12.10",
			"zetaoffice-wasm-free",
			"palico-qpdf-v0.3.1",
			"palico-model-v1",
			"palico-ort-v1",
		]);
	});

	it("stops the session: no more update checks", async () => {
		const sw = makeFakeSw({ registered: true });
		await run(
			sw,
			Effect.gen(function* () {
				yield* stopOffline;
				yield* settle;
				yield* TestClock.adjust("2 hours");
				sw.becomeVisible();
				yield* settle;
				expect(sw.calls.update).toBe(0);
			}),
		);
	});

	it("lets the person turn offline on again in the same session", async () => {
		const sw = makeFakeSw({ registered: true });
		await run(
			sw,
			Effect.gen(function* () {
				yield* stopOffline;
				yield* settle;
				expect(shell()).toBe("Off");
				yield* requestOffline;
				yield* settle;
				expect(sw.calls.register).toBe(2);
				expect(shell()).toBe("Active");
			}),
		);
	});

	it("fails with SwDisableError and changes nothing when unregister fails", async () => {
		const sw = makeFakeSw({ registered: true, unregisterFails: true });

		const cache = await run(
			sw,
			Effect.gen(function* () {
				const error = yield* stopOffline.pipe(Effect.flip);
				expect(error._tag).toBe("SwDisableError");
				yield* settle;
				expect(shell()).toBe("Active");
			}),
			caches,
		);

		expect(cache.names.size).toBe(caches.length);
	});
});

describe("the stored opt-out", () => {
	it("keeps an installed app off at launch after Stop", async () => {
		const sw = makeFakeSw({
			registered: false,
			standalone: true,
			optedOut: true,
		});

		await run(sw, Effect.void);
		expect(sw.calls.register).toBe(0);
		expect(shell()).toBe("Off");
	});

	it("is stored by Stop", async () => {
		const sw = makeFakeSw({ registered: true });
		await run(
			sw,
			Effect.gen(function* () {
				expect(sw.isOptedOut()).toBe(false);
				yield* stopOffline;
				expect(sw.isOptedOut()).toBe(true);
			}),
		);
	});

	it("is not stored when the unregister fails", async () => {
		const sw = makeFakeSw({ registered: true, unregisterFails: true });
		await run(sw, stopOffline.pipe(Effect.ignore));
		expect(sw.isOptedOut()).toBe(false);
	});

	it("is cleared by an explicit request", async () => {
		const sw = makeFakeSw({ registered: false, optedOut: true });
		await run(
			sw,
			Effect.gen(function* () {
				yield* requestOffline;
				yield* settle;
				expect(sw.isOptedOut()).toBe(false);
				expect(sw.calls.register).toBe(1);
			}),
		);
	});

	it("is cleared by installing the app", async () => {
		const sw = makeFakeSw({ registered: false, optedOut: true });
		await run(
			sw,
			Effect.gen(function* () {
				sw.install();
				yield* settle;
				expect(sw.isOptedOut()).toBe(false);
				expect(sw.calls.register).toBe(1);
			}),
		);
	});

	it("is cleared by a real engine download", async () => {
		const sw = makeFakeSw({ registered: false, optedOut: true });
		await run(
			sw,
			Effect.gen(function* () {
				yield* guardedEngineLoad("ffmpeg", Effect.void).pipe(
					Effect.provide(makeFakeStorage({}).layer),
				);
				yield* settle;
				expect(sw.isOptedOut()).toBe(false);
				expect(sw.calls.register).toBe(1);
			}),
		);
	});
});

describe("stop and enable racing", () => {
	it("ends consistent when a request is followed at once by a stop", async () => {
		const sw = makeFakeSw({ registered: false });
		await run(
			sw,
			Effect.gen(function* () {
				yield* requestOffline;
				yield* stopOffline;
				yield* settle;

				// Either registered and Active, or unregistered and Off. Never a mix.
				if (sw.isRegistered()) expect(shell()).toBe("Active");
				else expect(shell()).toBe("Off");
			}),
		);
	});

	it("a stop while no session runs does not end the next session", async () => {
		const sw = makeFakeSw({ registered: false });
		await run(
			sw,
			Effect.gen(function* () {
				expect(shell()).toBe("Off");
				yield* stopOffline;
				yield* requestOffline;
				yield* settle;
				expect(shell()).toBe("Active");
				expect(sw.isRegistered()).toBe(true);
			}),
		);
	});

	it("a stop after a failed registration does not end the next session", async () => {
		const sw = makeFakeSw({ registered: false, registerFailures: 1 });
		await run(
			sw,
			Effect.gen(function* () {
				yield* requestOffline;
				yield* settle;
				expect(shell()).toBe("Failed");
				yield* stopOffline;
				yield* settle;
				expect(shell()).toBe("Off");
				yield* requestOffline;
				yield* settle;
				expect(shell()).toBe("Active");
			}),
		);
	});
});

describe("turning offline on again after Stop in the same visit", () => {
	it("is not mistaken for an update by the old controller", async () => {
		// The old worker still controls the page until reload.
		const sw = makeFakeSw({ registered: true, hadController: true });
		await run(
			sw,
			Effect.gen(function* () {
				yield* stopOffline;
				yield* settle;
				yield* requestOffline;
				yield* settle;
				expect(shell()).toBe("Active");
				// The fresh worker claims the page.
				sw.emit("controller-changed");
				yield* settle;
				expect(get(reloadNeededRef)).toBe(false);
				expect(get(updateRef)).toBe("idle");
				expect(sw.calls.activate).toBe(0);
			}),
		);
	});
});
