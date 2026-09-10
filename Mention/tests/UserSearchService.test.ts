import { describe, expect, it, vi } from "vitest";
import { UserSearchService } from "../MentionControl/services/UserSearchService";

interface Recorded {
	entity: string;
	options: string;
	maxPageSize?: number;
}

function makeWebApi(entities: Record<string, unknown>[], recorded: Recorded[] = []) {
	return {
		retrieveMultipleRecords: vi.fn((entity: string, options: string, maxPageSize?: number) => {
			recorded.push({ entity, options, maxPageSize });
			return Promise.resolve({ entities, nextLink: "" });
		}),
		createRecord: vi.fn(),
		updateRecord: vi.fn(),
		deleteRecord: vi.fn(),
		retrieveRecord: vi.fn(),
	} as unknown as ComponentFramework.WebApi;
}

const USER = (over: Record<string, unknown> = {}) => ({
	systemuserid: "u1",
	fullname: "Anna Berger",
	internalemailaddress: "anna@contoso.com",
	jobtitle: "Sales Manager",
	...over,
});

describe("UserSearchService", () => {
	it("queries the systemuser table and excludes disabled users", async () => {
		const recorded: Recorded[] = [];
		await new UserSearchService(makeWebApi([], recorded)).search("Ann");

		expect(recorded[0].entity).toBe("systemuser");
		expect(recorded[0].options).toContain("isdisabled eq false");
		expect(recorded[0].options).toContain("$orderby=fullname asc");
	});

	it("filters on the typed term", async () => {
		const recorded: Recorded[] = [];
		await new UserSearchService(makeWebApi([], recorded)).search("  Ann  ");

		expect(recorded[0].options).toContain("contains(fullname,'Ann')");
	});

	it("escapes a quote in the term so the OData literal stays intact", async () => {
		const recorded: Recorded[] = [];
		await new UserSearchService(makeWebApi([], recorded)).search("O'Brien");

		expect(recorded[0].options).toContain("contains(fullname,'O''Brien')");
	});

	it("omits the filter for an empty term, listing the first users instead", async () => {
		const recorded: Recorded[] = [];
		await new UserSearchService(makeWebApi([], recorded)).search("");

		expect(recorded[0].options).not.toContain("contains(fullname");
		expect(recorded[0].options).toContain("$filter=isdisabled eq false");
	});

	it("maps a record onto a suggestion", async () => {
		const { users } = await new UserSearchService(makeWebApi([USER()])).search("Ann");

		expect(users).toEqual([
			{ id: "u1", name: "Anna Berger", email: "anna@contoso.com", jobTitle: "Sales Manager" },
		]);
	});

	it("leaves out application users, which cannot receive mail", async () => {
		const { users } = await new UserSearchService(
			makeWebApi([USER(), USER({ systemuserid: "u2", fullname: "Portal App", applicationid: "app-1" })])
		).search("");

		expect(users.map((user) => user.id)).toEqual(["u1"]);
	});

	it("skips records without an id or a name", async () => {
		const { users } = await new UserSearchService(
			makeWebApi([USER({ systemuserid: undefined }), USER({ systemuserid: "u3", fullname: undefined }), USER()])
		).search("");

		expect(users.map((user) => user.id)).toEqual(["u1"]);
	});

	it("never returns more than the page size", async () => {
		const many = Array.from({ length: 40 }, (_, index) => USER({ systemuserid: `u${index.toString()}` }));
		const { users } = await new UserSearchService(makeWebApi(many), 5).search("");

		expect(users).toHaveLength(5);
	});

	it("reports that the server had more matches than fit in the list", async () => {
		const many = Array.from({ length: 40 }, (_, index) => USER({ systemuserid: `u${index.toString()}` }));
		const { hasMore } = await new UserSearchService(makeWebApi(many), 5).search("Ann");

		expect(hasMore).toBe(true);
	});

	it("does not claim more matches when the result fits", async () => {
		const few = Array.from({ length: 3 }, (_, index) => USER({ systemuserid: `u${index.toString()}` }));
		const { hasMore } = await new UserSearchService(makeWebApi(few), 5).search("Ann");

		expect(hasMore).toBe(false);
	});

	it("does not claim more matches when the surplus is only application users", async () => {
		const records = [
			USER({ systemuserid: "u1" }),
			USER({ systemuserid: "u2" }),
			USER({ systemuserid: "app", applicationid: "app-1" }),
		];
		const { users, hasMore } = await new UserSearchService(makeWebApi(records), 2).search("Ann");

		expect(users).toHaveLength(2);
		expect(hasMore).toBe(false);
	});

	it("asks for one more than it shows, so truncation can be detected", async () => {
		const recorded: Recorded[] = [];
		await new UserSearchService(makeWebApi([], recorded), 10).search("Ann");

		expect(recorded[0].options).toContain("$top=21");
		expect(recorded[0].maxPageSize).toBe(21);
	});

	it("reports a missing job title as absent rather than empty", async () => {
		const { users } = await new UserSearchService(makeWebApi([USER({ jobtitle: null })])).search("Ann");

		expect(users[0].jobTitle).toBeUndefined();
	});
});
