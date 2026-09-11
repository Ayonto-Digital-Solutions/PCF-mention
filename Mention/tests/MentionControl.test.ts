import { afterEach, describe, expect, it, vi } from "vitest";
import { MentionControl } from "../MentionControl/index";
import type { IInputs } from "../MentionControl/generated/ManifestTypes";

/**
 * The control class is what the platform actually drives, so the reconciliation between the
 * column the platform reports and the text the editor holds is exercised here directly.
 */
interface ContextOptions {
	value?: string | null;
	disabled?: boolean;
	offline?: boolean;
	sendEmail?: "0" | "1";
	sendTeams?: "0" | "1";
	wording?: Partial<Record<"emailSubject" | "emailLinkText" | "teamsSubject" | "teamsLinkText", string>>;
	entityName?: string;
	entityId?: string;
	/** What a model-driven host reports about the record the component sits on. */
	contextInfo?: { entityId?: string; entityTypeName?: string };
}

function makeContext(options: ContextOptions = {}) {
	const text = (raw: string | null) => ({ raw, type: "SingleLine.Text" });

	return {
		parameters: {
			field: { raw: options.value ?? "", type: "SingleLine.Text", attributes: { MaxLength: 100 } },
			entityId: text(options.entityId ?? ""),
			entityName: text(options.entityName ?? ""),
			sendEmail: { raw: options.sendEmail ?? "0", type: "Enum" },
			sendTeams: { raw: options.sendTeams ?? "1", type: "Enum" },
			senderUserId: text(""),
			emailSubject: text(options.wording?.emailSubject ?? ""),
			emailContent: text(""),
			emailLinkText: text(options.wording?.emailLinkText ?? ""),
			teamsSubject: text(options.wording?.teamsSubject ?? ""),
			teamsContent: text(""),
			teamsLinkText: text(options.wording?.teamsLinkText ?? ""),
			orgUrl: text(""),
			appId: text(""),
			mentionTable: text(""),
		},
		mode: {
			isControlDisabled: options.disabled ?? false,
			label: "Description",
			trackContainerResize: vi.fn(),
			...(options.contextInfo ? { contextInfo: options.contextInfo } : {}),
		},
		client: {
			isOffline: () => options.offline ?? false,
			isNetworkAvailable: () => !(options.offline ?? false),
		},
		userSettings: { userId: "{11111111-1111-1111-1111-111111111111}" },
		formatting: { formatInteger: (value: number) => String(value) },
		resources: { getString: (key: string) => key },
		webAPI: {
			retrieveMultipleRecords: vi.fn().mockResolvedValue({ entities: [] }),
			createRecord: vi.fn(),
			updateRecord: vi.fn(),
		},
		navigation: { openForm: vi.fn().mockResolvedValue(undefined) },
	} as unknown as ComponentFramework.Context<IInputs>;
}

/** Reaches the props the control hands to the editor without rendering React. */
function propsOf(element: React.ReactElement) {
	return element.props as {
		value: string;
		disabled: boolean;
		notice?: string;
		label?: string;
		onChange: (value: string) => void;
		onEditingChange: (editing: boolean) => void;
		onMention: (user: { id: string; name: string }) => Promise<void>;
		onWrittenMentionsChange: (userIds: readonly string[]) => void;
	};
}

function mount(options: ContextOptions = {}) {
	const control = new MentionControl();
	const context = makeContext(options);
	const notifyOutputChanged = vi.fn();
	control.init(context, notifyOutputChanged);
	const props = propsOf(control.updateView(context));
	return { control, context, notifyOutputChanged, props };
}

describe("MentionControl value reconciliation", () => {
	it("hands the column value to the editor", () => {
		const { props } = mount({ value: "from the record" });
		expect(props.value).toBe("from the record");
	});

	it("reports the edited value as the column output", () => {
		const { control, props, notifyOutputChanged } = mount({ value: "old" });
		props.onChange("edited");

		expect(notifyOutputChanged).toHaveBeenCalled();
		expect(control.getOutputs()).toEqual({ field: "edited" });
	});

	it("ignores an update that still carries the text from before the edit", () => {
		const { control, props } = mount({ value: "old" });
		props.onEditingChange(true);
		props.onChange("old and new");

		// The platform has not caught up yet and repeats the pre-edit text.
		control.updateView(makeContext({ value: "old" }));

		expect(control.getOutputs()).toEqual({ field: "old and new" });
	});

	it("follows the platform once it echoes the edit back", () => {
		const { control, props } = mount({ value: "old" });
		props.onEditingChange(true);
		props.onChange("old and new");
		control.updateView(makeContext({ value: "old and new" }));

		props.onEditingChange(false);
		control.updateView(makeContext({ value: "written by something else" }));

		expect(control.getOutputs()).toEqual({ field: "written by something else" });
	});

	it("cannot be wedged by a platform that never echoes the edit back", () => {
		// A value that is neither the current one nor the known-stale one is news, and is taken.
		const { control, props } = mount({ value: "old" });
		props.onChange("edited");

		control.updateView(makeContext({ value: "a third value" }));

		expect(control.getOutputs()).toEqual({ field: "a third value" });
	});

	it("keeps the user's text while the editor has the focus", () => {
		const { control, props } = mount({ value: "old" });
		props.onEditingChange(true);
		props.onChange("typing");

		control.updateView(makeContext({ value: "someone else wrote this" }));

		expect(control.getOutputs()).toEqual({ field: "typing" });
	});

	it("takes the platform's value when the column is locked, even mid-edit", () => {
		// A business rule can lock the column without the textarea ever blurring.
		const { control, props } = mount({ value: "old" });
		props.onEditingChange(true);
		props.onChange("typing");

		control.updateView(makeContext({ value: "locked value", disabled: true }));

		expect(control.getOutputs()).toEqual({ field: "locked value" });
	});

	it("treats a null column as empty text", () => {
		const control = new MentionControl();
		const context = makeContext({ value: null });
		control.init(context, vi.fn());

		expect(propsOf(control.updateView(context)).value).toBe("");
	});
});

describe("MentionControl availability", () => {
	it("says nothing is wrong on a saved record with a connection", () => {
		const { props } = mount({ entityName: "account", entityId: "11111111-0000-0000-0000-000000000001" });
		expect(props.notice).toBeUndefined();
	});

	it("explains that mentioning is unavailable offline", () => {
		const { props } = mount({ offline: true });
		expect(props.notice).toBe("Editor_OfflineNotice");
	});

	it("holds mentioning back on a record that was never saved", () => {
		const { props } = mount({ entityName: "account", entityId: "" });
		expect(props.notice).toBe("Editor_UnsavedRecordNotice");
	});

	it("does not hold anything back when the record properties are not configured", () => {
		const { props } = mount({ entityName: "", entityId: "" });
		expect(props.notice).toBeUndefined();
	});

	it("does not look up users while mentioning is unavailable", async () => {
		const retrieveMultipleRecords = vi.fn();
		const control = new MentionControl();
		const context = makeContext({ offline: true });
		Object.assign(context.webAPI, { retrieveMultipleRecords });

		control.init(context, vi.fn());
		const element = control.updateView(context);
		const search = (element.props as { searchUsers: (term: string) => Promise<unknown> }).searchUsers;

		await expect(search("An")).resolves.toEqual({ users: [], hasMore: false });
		expect(retrieveMultipleRecords).not.toHaveBeenCalled();
	});

	it("passes the column label on, so the editor has an accessible name", () => {
		const { props } = mount();
		expect(props.label).toBe("Description");
	});
});

describe("MentionControl notification timing", () => {
	const RECIPIENT = { id: "22222222-2222-2222-2222-222222222222", name: "Anna Berger" };

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("writes the mention when the form is closed", async () => {
		// The grace period cannot outlive the control, and a code component is not told whether
		// the record was saved. Dropping the notification would leave the author believing the
		// person was told.
		const { control, context, props } = mount({
			entityName: "account",
			entityId: "33333333-3333-3333-3333-333333333333",
		});
		const { createRecord } = context.webAPI as unknown as { createRecord: ReturnType<typeof vi.fn> };
		createRecord.mockResolvedValue({ entityType: "ayonto_mention", id: "44444444-4444-4444-4444-444444444444" });

		props.onChange("Danke @Anna Berger");
		// What the editor reports: this person is written in the text.
		props.onWrittenMentionsChange([RECIPIENT.id]);
		const pending = props.onMention(RECIPIENT);

		control.destroy();
		await pending;

		expect(createRecord).toHaveBeenCalledTimes(1);
		const [table, row] = createRecord.mock.calls[0] as [string, Record<string, string>];
		expect(table).toBe("ayonto_mention");
		expect(row).toMatchObject({
			ayonto_userid: RECIPIENT.id,
			ayonto_username: "Anna Berger",
			ayonto_recordtable: "account",
			ayonto_recordid: "33333333-3333-3333-3333-333333333333",
			ayonto_deliverystatus: "New",
		});
	});

	it("writes one row per switched-on channel, so each reports its own delivery", async () => {
		// One status column cannot say "the mail arrived but the chat message did not".
		const { control, context, props } = mount({
			entityName: "account",
			entityId: "33333333-3333-3333-3333-333333333333",
			sendTeams: "0",
		});
		const { createRecord } = context.webAPI as unknown as { createRecord: ReturnType<typeof vi.fn> };
		createRecord.mockResolvedValue({ entityType: "ayonto_mention", id: "44444444-4444-4444-4444-444444444444" });

		props.onChange("Danke @Anna Berger");
		props.onWrittenMentionsChange([RECIPIENT.id]);
		const pending = props.onMention(RECIPIENT);

		control.destroy();
		await pending;

		expect(createRecord).toHaveBeenCalledTimes(2);
		const channels = createRecord.mock.calls.map(
			(call) => (call[1] as Record<string, string>).ayonto_channel
		);
		expect(channels).toEqual(["Email", "Teams"]);
	});

	it("writes nothing for a channel that is switched off", async () => {
		const { control, context, props } = mount({
			entityName: "account",
			entityId: "33333333-3333-3333-3333-333333333333",
			sendEmail: "1",
			sendTeams: "0",
		});
		const { createRecord } = context.webAPI as unknown as { createRecord: ReturnType<typeof vi.fn> };
		createRecord.mockResolvedValue({ entityType: "ayonto_mention", id: "44444444-4444-4444-4444-444444444444" });

		props.onChange("Danke @Anna Berger");
		props.onWrittenMentionsChange([RECIPIENT.id]);
		const pending = props.onMention(RECIPIENT);

		control.destroy();
		await pending;

		expect(createRecord).toHaveBeenCalledTimes(1);
		expect((createRecord.mock.calls[0][1] as Record<string, string>).ayonto_channel).toBe("Teams");
	});

	it("lets a channel word it its own way, and falls back to the e-mail wording", async () => {
		// A chat message is read somewhere else than a mail. Configuring the same text twice is
		// the more common case, so only what a channel says for itself overrides.
		const { control, context, props } = mount({
			entityName: "account",
			entityId: "33333333-3333-3333-3333-333333333333",
			sendTeams: "0",
			wording: {
				emailSubject: "Sie wurden erwähnt",
				emailLinkText: "Datensatz öffnen",
				teamsSubject: "Kurz für dich",
			},
		});
		const { createRecord } = context.webAPI as unknown as { createRecord: ReturnType<typeof vi.fn> };
		createRecord.mockResolvedValue({ entityType: "ayonto_mention", id: "44444444-4444-4444-4444-444444444444" });

		props.onChange("Danke @Anna Berger");
		props.onWrittenMentionsChange([RECIPIENT.id]);
		const pending = props.onMention(RECIPIENT);

		control.destroy();
		await pending;

		const rows = createRecord.mock.calls.map((call) => call[1] as Record<string, string>);
		expect(rows[0]).toMatchObject({ ayonto_subject: "Sie wurden erwähnt", ayonto_linktext: "Datensatz öffnen" });
		// Its own subject, but the e-mail's link label — that one it does not say for itself.
		expect(rows[1]).toMatchObject({ ayonto_subject: "Kurz für dich", ayonto_linktext: "Datensatz öffnen" });
	});

	it("does not send for a mention that was taken back before the form closed", async () => {
		const { control, context, props } = mount({
			entityName: "account",
			entityId: "33333333-3333-3333-3333-333333333333",
		});
		const { createRecord } = context.webAPI as unknown as { createRecord: ReturnType<typeof vi.fn> };

		props.onChange("Danke @Anna Berger");
		props.onWrittenMentionsChange([RECIPIENT.id]);
		const pending = props.onMention(RECIPIENT);
		props.onChange("Danke");
		props.onWrittenMentionsChange([]);

		control.destroy();
		await pending;

		expect(createRecord).not.toHaveBeenCalled();
	});
});

describe("MentionControl record context", () => {
	const HOST = { entityId: "55555555-5555-5555-5555-555555555555", entityTypeName: "account" };

	it("takes the record from the host when the properties are empty", () => {
		// A maker cannot bind a text property to a primary key column, so the host is the
		// ordinary source. Nothing has to be configured for the mention to reach the record.
		const { props } = mount({ contextInfo: HOST });

		expect(props.notice).toBeUndefined();
	});

	it("still says to save first when the host reports a record without an id", () => {
		const { props } = mount({ contextInfo: { entityTypeName: "account" } });

		expect(props.notice).toBe("Editor_UnsavedRecordNotice");
	});

	it("lets the configured properties win over the host", async () => {
		const { control, context } = mount({
			contextInfo: HOST,
			entityName: "contact",
			entityId: "66666666-6666-6666-6666-666666666666",
		});
		const { createRecord } = context.webAPI as unknown as { createRecord: ReturnType<typeof vi.fn> };
		createRecord.mockResolvedValue({ entityType: "ayonto_mention", id: "77777777-7777-7777-7777-777777777777" });

		const props = propsOf(control.updateView(context));
		props.onChange("Danke @Anna Berger");
		props.onWrittenMentionsChange(["22222222-2222-2222-2222-222222222222"]);
		const pending = props.onMention({ id: "22222222-2222-2222-2222-222222222222", name: "Anna Berger" });
		control.destroy();
		await pending;

		const [, row] = createRecord.mock.calls[0] as [string, Record<string, string>];
		expect(row.ayonto_recordtable).toBe("contact");
		expect(row.ayonto_recordid).toBe("66666666-6666-6666-6666-666666666666");
	});

	it("works with neither the host nor the properties", () => {
		// No record link, but mentioning and notifying still run.
		const { props } = mount({});

		expect(props.notice).toBeUndefined();
	});
});

describe("MentionControl mention identity", () => {
	const THOMAS_A = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Thomas Müller" };
	const THOMAS_B = { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name: "Thomas Müller" };

	it("does not let one namesake vouch for the other", async () => {
		// Pick Thomas A, delete the mention, pick Thomas B — all inside the grace period. The
		// text says "@Thomas Müller" either way; only the user id tells the two apart.
		const { control, context, props } = mount({
			entityName: "account",
			entityId: "33333333-3333-3333-3333-333333333333",
		});
		const { createRecord } = context.webAPI as unknown as { createRecord: ReturnType<typeof vi.fn> };
		createRecord.mockResolvedValue({ entityType: "ayonto_mention", id: "44444444-4444-4444-4444-444444444444" });

		props.onChange("Hallo @Thomas Müller");
		props.onWrittenMentionsChange([THOMAS_A.id]);
		const first = props.onMention(THOMAS_A);

		props.onChange("Hallo ");
		props.onWrittenMentionsChange([]);
		props.onChange("Hallo @Thomas Müller");
		props.onWrittenMentionsChange([THOMAS_B.id]);
		const second = props.onMention(THOMAS_B);

		control.destroy();
		await Promise.all([first, second]);

		const written = createRecord.mock.calls.map((call) => (call[1] as Record<string, string>).ayonto_userid);
		expect(written).toEqual([THOMAS_B.id]);
	});

	it("drops the notification for a mention that was taken back, and takes a new one", async () => {
		vi.useFakeTimers();
		try {
			const { context, props } = mount({});
			const { createRecord } = context.webAPI as unknown as { createRecord: ReturnType<typeof vi.fn> };
			createRecord.mockResolvedValue({ entityType: "ayonto_mention", id: "55555555-5555-5555-5555-555555555555" });

			props.onChange("Hallo @Thomas Müller");
			props.onWrittenMentionsChange([THOMAS_A.id]);
			const dropped = props.onMention(THOMAS_A);

			// Taken back before the grace period is over.
			props.onChange("Hallo ");
			props.onWrittenMentionsChange([]);
			await vi.advanceTimersByTimeAsync(6000);
			await dropped;
			expect(createRecord).not.toHaveBeenCalled();

			// Written again: the same person may be notified after all.
			props.onChange("Hallo @Thomas Müller");
			props.onWrittenMentionsChange([THOMAS_A.id]);
			const taken = props.onMention(THOMAS_A);
			await vi.advanceTimersByTimeAsync(6000);
			await taken;

			expect(createRecord).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});
});
