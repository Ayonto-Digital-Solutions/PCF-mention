import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationScheduler } from "../MentionControl/services/NotificationScheduler";

const DELAY = 5000;

interface Payload {
	readonly to: string;
}

function makeScheduler(options: {
	mentioned?: string[];
	send?: (payload: Payload) => Promise<void>;
}) {
	// Who the text mentions, by user id — the editor reports exactly this.
	const mentioned = new Set(options.mentioned ?? ["user-1"]);
	const send = options.send ?? vi.fn<(payload: Payload) => Promise<void>>().mockResolvedValue(undefined);
	const scheduler = new NotificationScheduler<Payload>(DELAY, send, (key) => mentioned.has(key));
	return { scheduler, send, mentioned };
}

const item = (over: Partial<{ key: string; payload: Payload }> = {}) => ({
	key: "user-1",
	payload: { to: "user-1" },
	...over,
});

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("NotificationScheduler", () => {
	it("does not send before the grace period is over", async () => {
		const { scheduler, send } = makeScheduler({});
		const pending = scheduler.schedule(item());

		await vi.advanceTimersByTimeAsync(DELAY - 1);
		expect(send).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		await pending;
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("sends the payload it was given", async () => {
		const { scheduler, send } = makeScheduler({});
		const pending = scheduler.schedule(item({ payload: { to: "anna" } }));

		await vi.advanceTimersByTimeAsync(DELAY);
		await pending;

		expect(send).toHaveBeenCalledWith({ to: "anna" });
	});

	it("drops the notification when the mention was taken back during the wait", async () => {
		const { scheduler, send, mentioned } = makeScheduler({});
		const pending = scheduler.schedule(item());

		mentioned.delete("user-1");
		await vi.advanceTimersByTimeAsync(DELAY);
		await expect(pending).resolves.toBeUndefined();

		expect(send).not.toHaveBeenCalled();
	});

	it("ignores a second notification for a recipient that is still waiting", async () => {
		const { scheduler, send } = makeScheduler({});
		const first = scheduler.schedule(item());
		await scheduler.schedule(item());

		await vi.advanceTimersByTimeAsync(DELAY);
		await first;

		expect(send).toHaveBeenCalledTimes(1);
	});

	it("ignores a second notification for a recipient that was already told", async () => {
		const { scheduler, send } = makeScheduler({});
		const first = scheduler.schedule(item());
		await vi.advanceTimersByTimeAsync(DELAY);
		await first;

		await scheduler.schedule(item());
		await vi.advanceTimersByTimeAsync(DELAY);

		expect(send).toHaveBeenCalledTimes(1);
	});

	it("notifies two different recipients", async () => {
		const { scheduler, send, mentioned } = makeScheduler({});
		mentioned.add("user-2");
		const first = scheduler.schedule(item());
		const second = scheduler.schedule(item({ key: "user-2" }));

		await vi.advanceTimersByTimeAsync(DELAY);
		await Promise.all([first, second]);

		expect(send).toHaveBeenCalledTimes(2);
	});

	it("reports a failed send and leaves the recipient eligible for another attempt", async () => {
		const send = vi
			.fn<(payload: Payload) => Promise<void>>()
			.mockRejectedValueOnce(new Error("smtp down"))
			.mockResolvedValueOnce(undefined);
		const { scheduler } = makeScheduler({ send });

		// The rejection handler has to be attached before the timer fires, or the rejection is
		// unhandled for a tick and the run fails even though every assertion passes.
		const first = scheduler.schedule(item());
		const rejects = expect(first).rejects.toThrow("smtp down");
		await vi.advanceTimersByTimeAsync(DELAY);
		await rejects;

		const second = scheduler.schedule(item());
		await vi.advanceTimersByTimeAsync(DELAY);
		await second;

		expect(send).toHaveBeenCalledTimes(2);
	});

	it("notifies again once a withdrawn mention is made a second time", async () => {
		const { scheduler, send, mentioned } = makeScheduler({});
		const first = scheduler.schedule(item());
		await vi.advanceTimersByTimeAsync(DELAY);
		await first;

		// The user deletes the mention; the editor reports the change.
		mentioned.delete("user-1");
		scheduler.dropWithdrawn();

		// ...and mentions the same person again.
		mentioned.add("user-1");
		const second = scheduler.schedule(item());
		await vi.advanceTimersByTimeAsync(DELAY);
		await second;

		expect(send).toHaveBeenCalledTimes(2);
	});

	it("keeps a recipient whose mention is still in the text", async () => {
		const { scheduler, send } = makeScheduler({});
		const first = scheduler.schedule(item());
		await vi.advanceTimersByTimeAsync(DELAY);
		await first;

		scheduler.dropWithdrawn();
		await scheduler.schedule(item());
		await vi.advanceTimersByTimeAsync(DELAY);

		expect(send).toHaveBeenCalledTimes(1);
	});

	it("sends what is still waiting when it is flushed", async () => {
		// The control is going away and cannot wait out the rest of the grace period. Dropping the
		// notification would leave the author believing the person was told.
		const { scheduler, send } = makeScheduler({});
		const pending = scheduler.schedule(item());

		scheduler.flushPending();
		await pending;

		expect(send).toHaveBeenCalledTimes(1);
		expect(scheduler.isPending("user-1")).toBe(true);
	});

	it("still drops a withdrawn mention when it is flushed", async () => {
		const { scheduler, send, mentioned } = makeScheduler({});
		const pending = scheduler.schedule(item());
		mentioned.delete("user-1");

		scheduler.flushPending();
		await pending;

		expect(send).not.toHaveBeenCalled();
	});

	it("does not send twice when the timer would have fired after a flush", async () => {
		const { scheduler, send } = makeScheduler({});
		const pending = scheduler.schedule(item());

		scheduler.flushPending();
		await pending;
		await vi.advanceTimersByTimeAsync(DELAY * 2);

		expect(send).toHaveBeenCalledTimes(1);
	});

	it("leaves a notification that already went out alone when flushed", async () => {
		const { scheduler, send } = makeScheduler({});
		const first = scheduler.schedule(item());
		await vi.advanceTimersByTimeAsync(DELAY);
		await first;

		scheduler.flushPending();

		expect(send).toHaveBeenCalledTimes(1);
	});

	it("reports whether a recipient has something pending", async () => {
		const { scheduler } = makeScheduler({});
		expect(scheduler.isPending("user-1")).toBe(false);

		const pending = scheduler.schedule(item());
		expect(scheduler.isPending("user-1")).toBe(true);

		await vi.advanceTimersByTimeAsync(DELAY);
		await pending;
		expect(scheduler.isPending("user-1")).toBe(true);
	});
});
