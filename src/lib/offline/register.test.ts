import { Effect, Fiber, Layer, SubscriptionRef } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { makeFakeCache, makeFakeSw, settle } from "./fakes.ts";
import { startOffline } from "./register.ts";
import {
	reloadNeededRef,
	resetOfflineState,
	shellRef,
	updateRef,
} from "./state.ts";

beforeEach(() => Effect.runSync(resetOfflineState));

const get = <A>(ref: SubscriptionRef.SubscriptionRef<A>) =>
	Effect.runSync(SubscriptionRef.get(ref));

// Runs startOffline in the background with fakes, lets it settle, then runs `check`.
const run = (
	sw: ReturnType<typeof makeFakeSw>,
	check: Effect.Effect<void>,
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

describe("startOffline", () => {
	it("stays Unsupported without service workers", async () => {
		const sw = makeFakeSw({ supported: false });
		await run(sw, Effect.void);
		expect(get(shellRef)._tag).toBe("Unsupported");
		expect(sw.calls.register).toBe(0);
	});

	it("goes Installing then Active on the activated event", async () => {
		const sw = makeFakeSw({ initial: "installing", hadController: false });
		await run(
			sw,
			Effect.gen(function* () {
				expect(get(shellRef)._tag).toBe("Installing");
				sw.emit("activated");
				yield* settle;
				expect(get(shellRef)._tag).toBe("Active");
			}),
		);
		expect(sw.calls.register).toBe(1);
	});

	it("flags a waiting update", async () => {
		const sw = makeFakeSw();
		await run(
			sw,
			Effect.gen(function* () {
				sw.emit("update-waiting");
				yield* settle;
				expect(get(updateRef)).toBe("waiting");
			}),
		);
	});

	it("activates a waiting worker of this page's build without a prompt", async () => {
		const sw = makeFakeSw({ pageBuild: "b", waitingBuild: "b" });
		await run(
			sw,
			Effect.gen(function* () {
				sw.emit("update-waiting");
				yield* settle;
				expect(sw.calls.activate).toBe(1);
				expect(get(updateRef)).toBe("idle");
				// The takeover that follows is ours, not another tab's.
				sw.emit("controller-changed");
				yield* settle;
				expect(get(reloadNeededRef)).toBe(false);
				expect(sw.calls.reload).toBe(0);
			}),
		);
	});

	it("adopts a matching worker already waiting at registration", async () => {
		const sw = makeFakeSw({
			hasWaiting: true,
			pageBuild: "b",
			waitingBuild: "b",
		});

		await run(sw, Effect.void);
		expect(sw.calls.activate).toBe(1);
		expect(get(updateRef)).toBe("idle");
	});

	it("prompts when the waiting worker holds another build", async () => {
		const sw = makeFakeSw({ pageBuild: "a", waitingBuild: "b" });
		await run(
			sw,
			Effect.gen(function* () {
				sw.emit("update-waiting");
				yield* settle;
				expect(sw.calls.activate).toBe(0);
				expect(get(updateRef)).toBe("waiting");
			}),
		);
	});

	it("prompts when the waiting worker does not report a build", async () => {
		const sw = makeFakeSw({ hasWaiting: true, pageBuild: "b" });
		await run(sw, Effect.void);
		expect(sw.calls.activate).toBe(0);
		expect(get(updateRef)).toBe("waiting");
	});

	it("asks this tab to reload when another tab updated", async () => {
		const sw = makeFakeSw({ hadController: true });
		await run(
			sw,
			Effect.gen(function* () {
				sw.emit("controller-changed");
				yield* settle;
				expect(get(reloadNeededRef)).toBe(true);
			}),
		);
	});

	it("ignores controllerchange from the first install claiming the page", async () => {
		const sw = makeFakeSw({ hadController: false });
		await run(
			sw,
			Effect.gen(function* () {
				sw.emit("controller-changed");
				yield* settle;
				expect(get(reloadNeededRef)).toBe(false);
			}),
		);
	});

	it("checks for updates every hour and when the tab becomes visible", async () => {
		const sw = makeFakeSw();
		await run(
			sw,
			Effect.gen(function* () {
				const base = sw.calls.update;
				yield* TestClock.adjust("1 hour");
				yield* settle;
				expect(sw.calls.update).toBe(base + 1);
				sw.becomeVisible();
				yield* settle;
				expect(sw.calls.update).toBe(base + 2);
			}),
		);
	});

	it("removes stale engine buckets at startup", async () => {
		const sw = makeFakeSw();

		const cache = await run(sw, Effect.void, [
			"ffmpeg-wasm-v0.0.1",
			"palico-model-v1",
		]);

		expect([...cache.names]).toEqual(["palico-model-v1"]);
	});
});
