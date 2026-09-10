import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailNotificationService, NotificationError } from "../MentionControl/services/EmailNotificationService";
import type { UserSuggestion } from "../MentionControl/services/UserSearchService";

const RECIPIENT: UserSuggestion = { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Anna Berger" };
const SENDER = "{bbbbbbbb-0000-0000-0000-000000000002}";
const EMAIL_ID = "{cccccccc-0000-0000-0000-000000000003}";
const BARE_EMAIL_ID = "cccccccc-0000-0000-0000-000000000003";

function makeWebApi(overrides: Partial<ComponentFramework.WebApi> = {}) {
	return {
		createRecord: vi.fn().mockResolvedValue({ id: EMAIL_ID, entityType: "email" }),
		updateRecord: vi.fn().mockResolvedValue({ id: EMAIL_ID, entityType: "email" }),
		deleteRecord: vi.fn(),
		retrieveRecord: vi.fn(),
		retrieveMultipleRecords: vi.fn(),
		...overrides,
	} as unknown as ComponentFramework.WebApi & {
		createRecord: ReturnType<typeof vi.fn>;
		updateRecord: ReturnType<typeof vi.fn>;
	};
}

function makeUtils(entitySetName: string | undefined = "accounts") {
	return {
		getEntityMetadata: vi.fn().mockResolvedValue(entitySetName ? { EntitySetName: entitySetName } : {}),
		hasEntityPrivilege: vi.fn(),
		lookupObjects: vi.fn(),
	} as unknown as ComponentFramework.Utility & { getEntityMetadata: ReturnType<typeof vi.fn> };
}

const baseRequest = {
	recipient: RECIPIENT,
	senderUserId: SENDER,
	subject: "You were mentioned",
	body: "Please take a look",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, statusText: "No Content" });
	vi.stubGlobal("fetch", fetchMock);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("EmailNotificationService", () => {
	it("binds both parties as system users and strips the braces off the ids", async () => {
		const webAPI = makeWebApi();
		await new EmailNotificationService(webAPI, makeUtils()).notify(baseRequest);

		const [entity, payload] = webAPI.createRecord.mock.calls[0] as [string, Record<string, unknown>];
		expect(entity).toBe("email");
		expect(payload.email_activity_parties).toEqual([
			{
				"partyid_systemuser@odata.bind": "/systemusers(bbbbbbbb-0000-0000-0000-000000000002)",
				participationtypemask: 1,
			},
			{
				"partyid_systemuser@odata.bind": "/systemusers(aaaaaaaa-0000-0000-0000-000000000001)",
				participationtypemask: 2,
			},
		]);
	});

	it("escapes the body so a subject or message cannot inject markup", async () => {
		const webAPI = makeWebApi();
		await new EmailNotificationService(webAPI, makeUtils()).notify({
			...baseRequest,
			body: '<script>alert("x")</script>',
		});

		const payload = webAPI.createRecord.mock.calls[0][1] as Record<string, string>;
		expect(payload.description).not.toContain("<script>");
		expect(payload.description).toContain("&lt;script&gt;");
	});

	it("turns line breaks in the message into markup", async () => {
		const webAPI = makeWebApi();
		await new EmailNotificationService(webAPI, makeUtils()).notify({ ...baseRequest, body: "one\ntwo" });

		const payload = webAPI.createRecord.mock.calls[0][1] as Record<string, string>;
		expect(payload.description).toContain("one<br />two");
	});

	it("adds the record link under its label", async () => {
		const webAPI = makeWebApi();
		await new EmailNotificationService(webAPI, makeUtils()).notify({
			...baseRequest,
			recordUrl: "https://contoso.crm4.dynamics.com/main.aspx?pagetype=entityrecord&etn=account&id=1",
			recordLinkLabel: "Open the record",
		});

		const payload = webAPI.createRecord.mock.calls[0][1] as Record<string, string>;
		expect(payload.description).toContain('href="https://contoso.crm4.dynamics.com/main.aspx?pagetype=entityrecord&amp;etn=account&amp;id=1"');
		expect(payload.description).toContain(">Open the record</a>");
	});

	it("never puts the regarding lookup into the create call", async () => {
		const webAPI = makeWebApi();
		await new EmailNotificationService(webAPI, makeUtils()).notify({
			...baseRequest,
			entityName: "account",
			entityId: "11111111-0000-0000-0000-000000000009",
		});

		const payload = webAPI.createRecord.mock.calls[0][1] as Record<string, unknown>;
		expect(Object.keys(payload).some((key) => key.startsWith("regardingobjectid"))).toBe(false);
	});

	it("links the mail to the record with the activity-suffixed navigation property", async () => {
		const webAPI = makeWebApi();
		await new EmailNotificationService(webAPI, makeUtils()).notify({
			...baseRequest,
			entityName: "Account",
			entityId: "{11111111-0000-0000-0000-000000000009}",
		});

		expect(webAPI.updateRecord).toHaveBeenCalledTimes(1);
		expect(webAPI.updateRecord).toHaveBeenCalledWith("email", BARE_EMAIL_ID, {
			"regardingobjectid_account_email@odata.bind": "/accounts(11111111-0000-0000-0000-000000000009)",
		});
	});

	it("falls back to the unsuffixed navigation property", async () => {
		const updateRecord = vi
			.fn()
			.mockRejectedValueOnce(new Error("no such property"))
			.mockResolvedValueOnce({ id: EMAIL_ID, entityType: "email" });
		const webAPI = makeWebApi({ updateRecord } as unknown as Partial<ComponentFramework.WebApi>);

		await new EmailNotificationService(webAPI, makeUtils("asyncoperations")).notify({
			...baseRequest,
			entityName: "asyncoperation",
			entityId: "11111111-0000-0000-0000-000000000009",
		});

		expect(updateRecord).toHaveBeenCalledTimes(2);
		expect(updateRecord.mock.calls[1][2]).toEqual({
			"regardingobjectid_asyncoperation@odata.bind": "/asyncoperations(11111111-0000-0000-0000-000000000009)",
		});
	});

	it("still sends the mail when the record cannot be linked", async () => {
		const updateRecord = vi.fn().mockRejectedValue(new Error("no such property"));
		const webAPI = makeWebApi({ updateRecord } as unknown as Partial<ComponentFramework.WebApi>);

		await new EmailNotificationService(webAPI, makeUtils()).notify({
			...baseRequest,
			entityName: "account",
			entityId: "11111111-0000-0000-0000-000000000009",
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("still sends the mail when the table metadata is unreadable", async () => {
		const webAPI = makeWebApi();
		const utils = makeUtils();
		utils.getEntityMetadata.mockRejectedValue(new Error("no privilege"));

		await new EmailNotificationService(webAPI, utils).notify({
			...baseRequest,
			entityName: "account",
			entityId: "11111111-0000-0000-0000-000000000009",
		});

		expect(webAPI.updateRecord).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("does not try to link when the record was not configured", async () => {
		const webAPI = makeWebApi();
		await new EmailNotificationService(webAPI, makeUtils()).notify(baseRequest);

		expect(webAPI.updateRecord).not.toHaveBeenCalled();
	});

	it("triggers the bound SendEmail action against the environment's Web API", async () => {
		await new EmailNotificationService(makeWebApi(), makeUtils()).notify(baseRequest);

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`/api/data/v9.2/emails(${BARE_EMAIL_ID})/Microsoft.Dynamics.CRM.SendEmail`);
		expect(init.method).toBe("POST");
		expect(init.credentials).toBe("same-origin");
		expect(JSON.parse(init.body as string)).toEqual({ IssueSend: true });
	});

	it("reports a rejected send together with the id of the draft it left behind", async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });

		await expect(
			new EmailNotificationService(makeWebApi(), makeUtils()).notify(baseRequest)
		).rejects.toBeInstanceOf(NotificationError);

		await new EmailNotificationService(makeWebApi(), makeUtils())
			.notify(baseRequest)
			.catch((error: NotificationError) => {
				expect(error.emailId).toBe(BARE_EMAIL_ID);
				expect(error.message).toContain("403");
			});
	});

	it("refuses to create a mail without a sender", async () => {
		const webAPI = makeWebApi();

		await expect(
			new EmailNotificationService(webAPI, makeUtils()).notify({ ...baseRequest, senderUserId: "" })
		).rejects.toBeInstanceOf(NotificationError);
		expect(webAPI.createRecord).not.toHaveBeenCalled();
	});

	it("reads the table metadata only once per table", async () => {
		const utils = makeUtils();
		const service = new EmailNotificationService(makeWebApi(), utils);
		const request = { ...baseRequest, entityName: "account", entityId: "11111111-0000-0000-0000-000000000009" };

		await service.notify(request);
		await service.notify(request);

		expect(utils.getEntityMetadata).toHaveBeenCalledTimes(1);
	});
});
