import { Cause, Effect, Exit, Fiber, SubscriptionRef } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { withBusy } from "./busy.ts";
import { busyRef, resetOfflineState } from "./state.ts";

const count = () => Effect.runSync(SubscriptionRef.get(busyRef));

beforeEach(() => Effect.runSync(resetOfflineState));

describe("withBusy", () => {
	it("counts a running job and releases on success", async () => {
		const seen = await Effect.runPromise(
			withBusy(SubscriptionRef.get(busyRef)),
		);

		expect(seen).toBe(1);
		expect(count()).toBe(0);
	});

	it("releases when the job fails", async () => {
		const exit = await Effect.runPromiseExit(withBusy(Effect.fail("boom")));
		expect(Exit.isFailure(exit)).toBe(true);
		expect(count()).toBe(0);
	});

	it("releases when the job is interrupted (video cancel)", async () => {
		const program = Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(withBusy(Effect.never));
			yield* Effect.yieldNow;
			expect(count()).toBe(1);
			yield* Fiber.interrupt(fiber);
		});

		await Effect.runPromise(program);
		expect(count()).toBe(0);
	});

	it("counts overlapping jobs", async () => {
		const seen = await Effect.runPromise(
			withBusy(withBusy(SubscriptionRef.get(busyRef))),
		);

		expect(seen).toBe(2);
		expect(count()).toBe(0);
	});

	it("dies when the counter would go below zero", async () => {
		const exit = await Effect.runPromiseExit(
			withBusy(SubscriptionRef.set(busyRef, 0)),
		);

		expect(
			Exit.isFailure(exit) && exit.cause.reasons.some(Cause.isDieReason),
		).toBe(true);
	});
});
