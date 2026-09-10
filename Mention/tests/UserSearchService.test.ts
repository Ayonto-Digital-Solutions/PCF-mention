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

		// Doubling is the OData escape; encodeURIComponent deliberately leaves a quote alone,
		// and a doubled quote inside the literal is unambiguous.
		expect(recorded[0].options).toContain("contains(fullname,'O''Brien')");
	});

	const filterLiteral = (options: string) =>
		/contains\(fullname,'([^']*(?:''[^']*)*)'\)/.exec(options)?.[1] ?? "";

	it("encodes a term that would otherwise cut the query string in half", async () => {
		const recorded: Recorded[] = [];
		await new UserSearchService(makeWebApi([], recorded)).search("Anna &");

		// A raw "&" would start a new query parameter and truncate the filter.
		expect(filterLiteral(recorded[0].options)).toBe("Anna%20%26");
	});

	it("encodes characters that would otherwise be read as query syntax", async () => {
		const recorded: Recorded[] = [];
		await new UserSearchService(makeWebApi([], recorded)).search("a?b=c");

		expect(filterLiteral(recorded[0].options)).toBe("a%3Fb%3Dc");
	});

	it("does not let a typed percent sequence turn back into a quote", async () => {
		const recorded: Recorded[] = [];
		await new UserSearchService(makeWebApi([], recorded)).search("%27 or 1 eq 1");

		// %2527 decodes to the text "%27", not to a quote that would end the literal.
		expect(filterLiteral(recorded[0].options)).toBe("%2527%20or%201%20eq%201");
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

	it("leaves out the built-in accounts that have no mailbox", async () => {
		const { users } = await new UserSearchService(
			makeWebApi([
				USER(),
				USER({ systemuserid: "sup", fullname: "SUPPORT USER", accessmode: 3 }),
				USER({ systemuserid: "int", fullname: "INTEGRATION", accessmode: 4 }),
			])
		).search("");

		expect(users.map((user) => user.id)).toEqual(["u1"]);
	});

	it("keeps ordinary and administrative users", async () => {
		const { users } = await new UserSearchService(
			makeWebApi([USER({ accessmode: 0 }), USER({ systemuserid: "u2", accessmode: 1 })])
		).search("");

		expect(users.map((user) => user.id)).toEqual(["u1", "u2"]);
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

		expect(recorded[0].options).toContain("$top=11");
		expect(recorded[0].maxPageSize).toBe(11);
	});

	it("has the server leave out the accounts without a mailbox", async () => {
		// Dropping them from a full page afterwards is what leaves the list short, so the query
		// asks for a page that does not hold them in the first place.
		const recorded: Recorded[] = [];
		await new UserSearchService(makeWebApi([], recorded)).search("Ann");

		expect(recorded[0].options).toContain("applicationid eq null");
		expect(recorded[0].options).toContain("accessmode ne 3");
		expect(recorded[0].options).toContain("accessmode ne 4");
	});

	it("still finds users on an organisation that refuses to filter on those columns", async () => {
		const recorded: Recorded[] = [];
		const records = [USER(), USER({ systemuserid: "app", applicationid: "app-1" })];
		const webAPI = {
			retrieveMultipleRecords: vi.fn((entity: string, options: string, maxPageSize?: number) => {
				recorded.push({ entity, options, maxPageSize });
				return options.includes("applicationid eq null")
					? Promise.reject(new Error("Could not find a property named 'applicationid'"))
					: Promise.resolve({ entities: records, nextLink: "" });
			}),
		} as unknown as ComponentFramework.WebApi;

		const { users } = await new UserSearchService(webAPI, 10).search("Ann");

		// The second query carries neither exclusion, and asks for the wider page that leaves
		// room for what the loop then drops.
		expect(recorded).toHaveLength(2);
		expect(recorded[1].options).not.toContain("applicationid eq null");
		expect(recorded[1].options).not.toContain("accessmode ne");
		expect(recorded[1].options).toContain("$top=21");
		expect(users.map((user) => user.id)).toEqual(["u1"]);
	});

	it("reports a lookup that fails both ways rather than returning nothing", async () => {
		const webAPI = {
			retrieveMultipleRecords: vi.fn(() => Promise.reject(new Error("Access denied"))),
		} as unknown as ComponentFramework.WebApi;

		await expect(new UserSearchService(webAPI).search("Ann")).rejects.toThrow("Access denied");
	});

	it("reports a missing job title as absent rather than empty", async () => {
		const { users } = await new UserSearchService(makeWebApi([USER({ jobtitle: null })])).search("Ann");

		expect(users[0].jobTitle).toBeUndefined();
	});
});
