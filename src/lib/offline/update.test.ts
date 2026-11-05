import {
	Effect,
	Exit,
	Fiber,
	Layer,
	Option,
	Ref,
	Stream,
	SubscriptionRef,
} from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { makeFakeSw } from "./fakes.ts";
import { busyRef, handleRef, resetOfflineState, updateRef } from "./state.ts";
import { applyUpdate } from "./update.ts";

beforeEach(() => Effect.runSync(resetOfflineState));

const setup = (sw: ReturnType<typeof makeFakeSw>) =>
	Effect.gen(function* () {
		yield* Ref.set(
			handleRef,
			Option.some({
				initial: "active",
				hadController: true,
				hasWaiting: true,
				events: Stream.empty,
				update: Effect.void,
				waitingBuild: Effect.succeed(Option.none()),
				activateWaiting: Effect.sync(() => {
					sw.calls.activate++;
				}),
			}),
		);
		yield* SubscriptionRef.set(updateRef, "waiting");
	});

describe("applyUpdate", () => {
	it("refuses while a job is running and posts nothing", async () => {
		const sw = makeFakeSw();

		const exit = await Effect.runPromiseExit(
			Effect.gen(function* () {
				yield* setup(sw);
				yield* SubscriptionRef.set(busyRef, 1);

				return yield* applyUpdate;
			}).pipe(Effect.provide(sw.layer)),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		expect(JSON.stringify(exit)).toContain("UpdateBlockedError");
		expect(sw.calls.activate).toBe(0);
		expect(sw.calls.reload).toBe(0);
	});

	it("activates the waiting worker and reloads once when idle", async () => {
		const sw = makeFakeSw();
		await Effect.runPromise(
			Effect.gen(function* () {
				yield* Ref.set(
					handleRef,
					Option.some({
						initial: "active",
						hadController: true,
						hasWaiting: true,
						events: Stream.empty,
						update: Effect.void,
						waitingBuild: Effect.succeed(Option.none()),
						// Real behavior: posting SKIP_WAITING leads to controllerchange.
						activateWaiting: Effect.sync(() => {
							sw.calls.activate++;
						}).pipe(Effect.andThen(Effect.sync(() => sw.controllerChange()))),
					}),
				);
				yield* applyUpdate;
			}).pipe(Effect.provide(sw.layer)),
		);
		expect(sw.calls.activate).toBe(1);
		expect(sw.calls.reload).toBe(1);
	});

	it("fails with SwUpdateError when the worker never takes over", async () => {
		const sw = makeFakeSw({ controllerChangeOnActivate: false });

		const program = Effect.gen(function* () {
			yield* setup(sw);
			const fiber = yield* Effect.forkChild(Effect.result(applyUpdate));
			yield* Effect.yieldNow;
			yield* TestClock.adjust("5 seconds");
			const result = yield* Fiber.join(fiber);

			return result;
		}).pipe(Effect.provide(Layer.merge(sw.layer, TestClock.layer())));

		const result = await Effect.runPromise(program);
		expect(result._tag).toBe("Failure");
		expect(sw.calls.reload).toBe(0);
		// A failed attempt leaves the prompt available.
		expect(Effect.runSync(SubscriptionRef.get(updateRef))).toBe("waiting");
	});
});
