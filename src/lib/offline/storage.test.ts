import { Effect, Exit, SubscriptionRef } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFakeStorage } from "./fakes.ts";
import { notSavedRef, refreshRef, resetOfflineState } from "./state.ts";
import {
	afterDownload,
	preflightDownload,
	staleEngineBuckets,
} from "./storage.ts";

const MB = 1024 * 1024;

beforeEach(() => Effect.runSync(resetOfflineState));

afterEach(() => vi.unstubAllGlobals());

describe("staleEngineBuckets", () => {
	it("keeps current buckets and unrelated ones, flags old engine versions", () => {
		const stale = staleEngineBuckets([
			"ffmpeg-wasm-v0.12.9",
			"ffmpeg-wasm-v0.12.10",
			"zetaoffice-wasm-free",
			"zetaoffice-wasm-business",
			"workbox-precache-v2-https://palico.test/",
			"palico-model-v1",
		]);

		expect(stale).toEqual(["ffmpeg-wasm-v0.12.9", "zetaoffice-wasm-business"]);
	});
});

describe("preflightDownload", () => {
	const run = (storage: Parameters<typeof makeFakeStorage>[0]) =>
		Effect.runPromiseExit(
			preflightDownload("ffmpeg").pipe(
				Effect.provide(makeFakeStorage(storage).layer),
			),
		);

	it("fails with StorageQuotaError when free space is below the engine size", async () => {
		const exit = await run({ estimate: { quota: 40 * MB, usage: 20 * MB } });
		expect(Exit.isFailure(exit)).toBe(true);
		expect(JSON.stringify(exit)).toContain("StorageQuotaError");
	});

	it("passes when there is room", async () => {
		expect(
			Exit.isSuccess(
				await run({ estimate: { quota: 500 * MB, usage: 20 * MB } }),
			),
		).toBe(true);
	});

	it("skips the check when the browser cannot estimate", async () => {
		expect(Exit.isSuccess(await run({ unavailable: true }))).toBe(true);
		expect(Exit.isSuccess(await run({ estimate: {} }))).toBe(true);
		expect(Exit.isSuccess(await run({ estimate: "garbage" }))).toBe(true);
	});
});

describe("afterDownload", () => {
	it("marks NotSaved and skips persist when the bytes did not stick", async () => {
		const storage = makeFakeStorage({});

		const saved = await Effect.runPromise(
			afterDownload("ffmpeg").pipe(Effect.provide(storage.layer)),
		);

		expect(saved).toBe(false);
		expect(Effect.runSync(SubscriptionRef.get(notSavedRef)).has("ffmpeg")).toBe(
			true,
		);
		expect(storage.calls.persist).toBe(0);
		expect(Effect.runSync(SubscriptionRef.get(refreshRef))).toBe(1);
	});

	it("clears NotSaved and asks the browser to persist when saved", async () => {
		vi.stubGlobal("caches", {
			open: async () => ({ match: async () => new Response("x") }),
		});
		Effect.runSync(
			SubscriptionRef.set(notSavedRef, new Set(["ffmpeg"] as const)),
		);
		const storage = makeFakeStorage({ persist: true });

		const persisted = await Effect.runPromise(
			afterDownload("ffmpeg").pipe(Effect.provide(storage.layer)),
		);

		expect(persisted).toBe(true);
		expect(Effect.runSync(SubscriptionRef.get(notSavedRef)).has("ffmpeg")).toBe(
			false,
		);
		expect(storage.calls.persist).toBe(1);
	});
});
