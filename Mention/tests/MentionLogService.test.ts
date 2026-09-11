import { describe, expect, it, vi } from "vitest";
import { MentionLogService } from "../MentionControl/services/MentionLogService";

interface Recorded {
	table: string;
	row: Record<string, string>;
}

function makeWebApi(recorded: Recorded[] = [], entities: Record<string, unknown>[] = []) {
	return {
		createRecord: vi.fn((table: string, row: Record<string, string>) => {
			recorded.push({ table, row });
			return Promise.resolve({ entityType: table, id: "row-1" });
		}),
		retrieveMultipleRecords: vi.fn(() => Promise.resolve({ entities, nextLink: "" })),
		updateRecord: vi.fn(),
		deleteRecord: vi.fn(),
		retrieveRecord: vi.fn(),
	} as unknown as ComponentFramework.WebApi;
}

const REQUEST = {
	channel: "Email" as const,
	recipient: { id: "11111111-1111-1111-1111-111111111111", name: "Anna Berger", email: "anna@contoso.com" },
	senderUserId: "{22222222-2222-2222-2222-222222222222}",
	subject: "Sie wurden erwähnt",
	message: "Bitte einmal prüfen.",
	recordUrl: "https://contoso.crm4.dynamics.com/main.aspx?etn=account&id=3",
	entityName: "Account",
	entityId: "33333333-3333-3333-3333-333333333333",
	recordName: "Contoso AG",
	linkText: "Datensatz öffnen",
};

describe("MentionLogService", () => {
	it("writes one row into the table the solution ships", async () => {
		const recorded: Recorded[] = [];
		await new MentionLogService(makeWebApi(recorded)).write(REQUEST);

		expect(recorded).toHaveLength(1);
		expect(recorded[0].table).toBe("ayonto_mention");
		expect(recorded[0].row).toEqual({
			ayonto_channel: "Email",
			ayonto_linktext: "Datensatz öffnen",
			ayonto_name: "@Anna Berger · Contoso AG",
			ayonto_userid: "11111111-1111-1111-1111-111111111111",
			ayonto_username: "Anna Berger",
			ayonto_useremail: "anna@contoso.com",
			ayonto_mentionedbyid: "22222222-2222-2222-2222-222222222222",
			ayonto_recordtable: "account",
			ayonto_recordid: "33333333-3333-3333-3333-333333333333",
			ayonto_recordname: "Contoso AG",
			ayonto_recordurl: REQUEST.recordUrl,
			ayonto_subject: "Sie wurden erwähnt",
			ayonto_message: "Bitte einmal prüfen.",
			ayonto_deliverystatus: "New",
		});
	});

	it("takes the column prefix from the table it is pointed at", async () => {
		const recorded: Recorded[] = [];
		await new MentionLogService(makeWebApi(recorded), "contoso_mention").write(REQUEST);

		expect(recorded[0].table).toBe("contoso_mention");
		expect(Object.keys(recorded[0].row).every((key) => key.startsWith("contoso_"))).toBe(true);
	});

	it("leaves out what it does not have, rather than writing empty columns", async () => {
		const recorded: Recorded[] = [];
		await new MentionLogService(makeWebApi(recorded)).write({
			channel: "Email",
			recipient: { id: REQUEST.recipient.id, name: "Anna Berger" },
			senderUserId: "",
			subject: "Erwähnt",
			message: "Text",
		});

		expect(recorded[0].row).not.toHaveProperty("ayonto_useremail");
		expect(recorded[0].row).not.toHaveProperty("ayonto_recordtable");
		expect(recorded[0].row).not.toHaveProperty("ayonto_mentionedbyid");
		expect(recorded[0].row).not.toHaveProperty("ayonto_linktext");
		expect(recorded[0].row.ayonto_name).toBe("@Anna Berger");
	});

	it("refuses a mention without a recipient instead of writing a useless row", async () => {
		const recorded: Recorded[] = [];
		const service = new MentionLogService(makeWebApi(recorded));

		await expect(service.write({ ...REQUEST, recipient: { id: "", name: "Anna" } })).rejects.toThrow(
			/somebody to notify/i
		);
		expect(recorded).toHaveLength(0);
	});

	it("cuts a value that would not fit the column", async () => {
		const recorded: Recorded[] = [];
		await new MentionLogService(makeWebApi(recorded)).write({
			...REQUEST,
			message: "x".repeat(2500),
			subject: "y".repeat(300),
		});

		expect(recorded[0].row.ayonto_message).toHaveLength(2000);
		expect(recorded[0].row.ayonto_subject).toHaveLength(200);
	});

	it("reads back the mentions a record carries", async () => {
		const service = new MentionLogService(
			makeWebApi([], [
				{ ayonto_username: "Anna Berger", ayonto_userid: "{11111111-1111-1111-1111-111111111111}" },
				{ ayonto_username: "  ", ayonto_userid: "22222222-2222-2222-2222-222222222222" },
				{ ayonto_username: "Bob", ayonto_userid: "" },
			])
		);

		const mentions = await service.listFor("Account", "33333333-3333-3333-3333-333333333333");

		// Rows without a usable name or id are dropped: they could only produce a dead link.
		expect(mentions).toEqual([{ name: "Anna Berger", userId: "11111111-1111-1111-1111-111111111111" }]);
	});

	it("does not ask for mentions of a record that has no id yet", async () => {
		const webAPI = makeWebApi();
		const service = new MentionLogService(webAPI);

		const { retrieveMultipleRecords } = webAPI as unknown as {
			retrieveMultipleRecords: ReturnType<typeof vi.fn>;
		};
		expect(await service.listFor("account", "")).toEqual([]);
		expect(retrieveMultipleRecords).not.toHaveBeenCalled();
	});
});
