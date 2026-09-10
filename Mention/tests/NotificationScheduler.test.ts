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
	const mentioned = new Set(options.mentioned ?? ["Anna Berger"]);
	const send = options.send ?? vi.fn<(payload: Payload) => Promise<void>>().mockResolvedValue(undefined);
	const scheduler = new NotificationScheduler<Payload>(DELAY, send, (name) => mentioned.has(name));
	return { scheduler, send, mentioned };
}

const item = (over: Partial<{ key: string; mentionName: string; payload: Payload }> = {}) => ({
	key: "user-1",
	mentionName: "Anna Berger",
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

		mentioned.delete("Anna Berger");
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
		mentioned.add("Bert Klein");
		const first = scheduler.schedule(item());
		const second = scheduler.schedule(item({ key: "user-2", mentionName: "Bert Klein" }));

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

		const first = scheduler.schedule(item());
		await vi.advanceTimersByTimeAsync(DELAY);
		await expect(first).rejects.toThrow("smtp down");

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
		mentioned.delete("Anna Berger");
		scheduler.dropWithdrawn();

		// ...and mentions the same person again.
		mentioned.add("Anna Berger");
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
