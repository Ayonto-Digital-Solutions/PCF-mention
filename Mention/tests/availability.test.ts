import { describe, expect, it } from "vitest";
import { mentionBlocker, type MentionAvailability } from "../MentionControl/utils/availability";

const state = (over: Partial<MentionAvailability> = {}): MentionAvailability => ({
	isOffline: false,
	notificationsEnabled: true,
	entityNameConfigured: true,
	hasRecordId: true,
	...over,
});

describe("mentionBlocker", () => {
	it("allows mentioning on a saved record with a connection", () => {
		expect(mentionBlocker(state())).toBeUndefined();
	});

	it("blocks while offline", () => {
		expect(mentionBlocker(state({ isOffline: true }))).toBe("offline");
	});

	it("reports offline even when the record is also unsaved", () => {
		expect(mentionBlocker(state({ isOffline: true, hasRecordId: false }))).toBe("offline");
	});

	it("blocks on a record the user has not saved yet", () => {
		expect(mentionBlocker(state({ hasRecordId: false }))).toBe("unsaved-record");
	});

	it("does not block an unsaved record when notifications are switched off", () => {
		expect(mentionBlocker(state({ hasRecordId: false, notificationsEnabled: false }))).toBeUndefined();
	});

	it("does not block when the maker never bound the record properties", () => {
		// Neither configured is a deliberate setup: notify without a record link.
		expect(
			mentionBlocker(state({ hasRecordId: false, entityNameConfigured: false }))
		).toBeUndefined();
	});

	it("allows mentioning with notifications off and a saved record", () => {
		expect(mentionBlocker(state({ notificationsEnabled: false }))).toBeUndefined();
	});
});
