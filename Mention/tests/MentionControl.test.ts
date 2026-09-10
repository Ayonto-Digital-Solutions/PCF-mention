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
			senderUserId: text(""),
			emailSubject: text(""),
			emailContent: text(""),
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

	it("does not send for a mention that was taken back before the form closed", async () => {
		const { control, context, props } = mount({
			entityName: "account",
			entityId: "33333333-3333-3333-3333-333333333333",
		});
		const { createRecord } = context.webAPI as unknown as { createRecord: ReturnType<typeof vi.fn> };

		props.onChange("Danke @Anna Berger");
		const pending = props.onMention(RECIPIENT);
		props.onChange("Danke");

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
