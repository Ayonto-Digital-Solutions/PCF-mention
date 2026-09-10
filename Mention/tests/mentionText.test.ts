import { describe, expect, it } from "vitest";
import {
	MAX_QUERY_LENGTH,
	applyMention,
	buildRecordUrl,
	escapeHtml,
	escapeODataLiteral,
	findMentionTrigger,
	normalizeGuid,
	reanchorMentions,
	splitMentions,
} from "../MentionControl/utils/mentionText";

describe("findMentionTrigger", () => {
	it("finds a trigger at the start of the text", () => {
		expect(findMentionTrigger("@Ann", 4)).toEqual({
			start: 0,
			end: 4,
			query: "Ann",
		});
	});

	it("finds a trigger that follows whitespace", () => {
		expect(findMentionTrigger("hi @Ann", 7)).toEqual({
			start: 3,
			end: 7,
			query: "Ann",
		});
	});

	it("allows one space inside the query, because user names contain one", () => {
		expect(findMentionTrigger("cc @Ann Smi", 11)).toEqual({
			start: 3,
			end: 11,
			query: "Ann Smi",
		});
	});

	it("stops at a second space, so the query cannot swallow the sentence", () => {
		expect(findMentionTrigger("cc @Ann and please look", 23)).toBeNull();
	});

	it("closes on a trailing space, so a finished mention stops searching", () => {
		expect(findMentionTrigger("cc @Ann Smith ", 14)).toBeNull();
	});

	it("ignores an @ that is glued to a word, so e-mail addresses do not trigger it", () => {
		expect(findMentionTrigger("mail ann@contoso", 16)).toBeNull();
	});

	it("does not look across a line break", () => {
		expect(findMentionTrigger("@Ann\nmore", 9)).toBeNull();
	});

	it("gives up once the query grows past the maximum length", () => {
		const text = `@${"x".repeat(MAX_QUERY_LENGTH + 5)}`;
		expect(findMentionTrigger(text, text.length)).toBeNull();
	});

	it("returns null when there is no @ at all", () => {
		expect(findMentionTrigger("plain text", 10)).toBeNull();
	});

	it("uses the @ closest to the caret", () => {
		expect(findMentionTrigger("@Bo @An", 7)).toEqual({
			start: 4,
			end: 7,
			query: "An",
		});
	});

	it("returns null for a caret outside the text", () => {
		expect(findMentionTrigger("@Ann", 99)).toBeNull();
	});
});

describe("applyMention", () => {
	it("replaces the query with the full name and appends a separating space", () => {
		const trigger = findMentionTrigger("hi @An", 6);
		expect(trigger).not.toBeNull();
		expect(applyMention("hi @An", trigger!, "Ann Smith")).toEqual({
			text: "hi @Ann Smith ",
			caret: 14,
		});
	});

	it("keeps whatever followed the caret", () => {
		const trigger = findMentionTrigger("hi @An, bye", 6);
		expect(applyMention("hi @An, bye", trigger!, "Ann Smith").text).toBe(
			"hi @Ann Smith , bye",
		);
	});

	it("does not add a second space when one is already there", () => {
		const trigger = findMentionTrigger("hi @An bye", 6);
		// The caret goes behind that space, not in front of it: typing on from there has to
		// continue the sentence rather than run into the name.
		expect(applyMention("hi @An bye", trigger!, "Ann Smith")).toEqual({
			text: "hi @Ann Smith bye",
			caret: 14,
		});
	});

	it("leaves the caret behind the space it wrote itself", () => {
		const trigger = findMentionTrigger("hi @An", 6);
		const result = applyMention("hi @An", trigger!, "Ann Smith");
		expect(result.text.slice(0, result.caret)).toBe("hi @Ann Smith ");
	});
});

describe("escaping", () => {
	it("doubles single quotes so an OData literal stays intact", () => {
		expect(escapeODataLiteral("O'Brien")).toBe("O''Brien");
	});

	it("escapes the characters that would break the HTML mail body", () => {
		expect(escapeHtml('<b>&"x"</b>')).toBe("&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;");
	});

	it("strips the braces Dataverse puts around record ids", () => {
		expect(normalizeGuid("{ABC-123}")).toBe("ABC-123");
	});

	it("turns a missing id into an empty string", () => {
		expect(normalizeGuid(null)).toBe("");
	});
});

describe("buildRecordUrl", () => {
	it("builds the deep link and normalizes the trailing slash and the id", () => {
		expect(
			buildRecordUrl({ orgUrl: "https://contoso.crm4.dynamics.com/", entityName: "account", entityId: "{11}" })
		).toBe("https://contoso.crm4.dynamics.com/main.aspx?pagetype=entityrecord&etn=account&id=11");
	});

	it("puts the app id first when one is configured", () => {
		expect(buildRecordUrl({ orgUrl: "https://c", entityName: "account", entityId: "1", appId: "9" })).toBe(
			"https://c/main.aspx?appid=9&pagetype=entityrecord&etn=account&id=1"
		);
	});

	it("returns undefined when the environment URL was not configured", () => {
		expect(buildRecordUrl({ entityName: "account", entityId: "1" })).toBeUndefined();
	});

	it("returns undefined when the record id is missing", () => {
		expect(buildRecordUrl({ orgUrl: "https://c", entityName: "account" })).toBeUndefined();
	});
});

describe("reanchorMentions", () => {
	it("moves a mention along when text is inserted in front of it", () => {
		expect(
			reanchorMentions(
				[{ start: 3, name: "Bob", userId: "u-bob" }],
				"hi @Bob ",
				"hi there @Bob ",
			),
		).toEqual([{ start: 9, name: "Bob", userId: "u-bob" }]);
	});

	it("leaves a mention that did not move where it is", () => {
		expect(
			reanchorMentions(
				[{ start: 3, name: "Bob", userId: "u-bob" }],
				"hi @Bob ",
				"hi @Bob thanks",
			),
		).toEqual([{ start: 3, name: "Bob", userId: "u-bob" }]);
	});

	it("forgets a mention that is no longer in the text", () => {
		expect(
			reanchorMentions(
				[{ start: 3, name: "Bob", userId: "u-bob" }],
				"hi @Bob ",
				"hi thanks",
			),
		).toEqual([]);
	});

	it("forgets a mention the edit wrote into", () => {
		// "@Bob" with an "s" typed onto it is a mention of nobody, so whoever it stood for is no
		// longer mentioned — and a notification still waiting for them must not go out.
		expect(
			reanchorMentions(
				[{ start: 3, name: "Bob", userId: "u-bob" }],
				"hi @Bob ",
				"hi @Bobs ",
			),
		).toEqual([]);
	});

	it("does not mistake a longer name for the one it is looking for", () => {
		expect(
			reanchorMentions(
				[{ start: 0, name: "Bob", userId: "u-bob" }],
				"@Bob ",
				"@Bobbie Jones ",
			),
		).toEqual([]);
	});

	it("keeps two mentions of the same person apart when one edit moves both", () => {
		// Picking a suggestion inserts a whole name at once, and it starts with the same "@" it is
		// placed in front of — so the change alone cannot say where it begins. Losing a record here
		// would leave that mention unguarded: the picker reopens over it and Enter overwrites it.
		const anchored = reanchorMentions(
			[
				{ start: 0, name: "Bob", userId: "u-bob" },
				{ start: 5, name: "Bob", userId: "u-bob" },
			],
			"@Bob @Bob ",
			"@Anna Berger @Bob @Bob ",
		);

		expect(anchored.map((mention) => mention.start)).toEqual([13, 18]);
	});

	it("does not let a short name take the mention of a longer one", () => {
		// "@Bob Schmidt" also reads as a mention of "Bob" followed by a space.
		const anchored = reanchorMentions(
			[
				{ start: 0, name: "Bob Schmidt", userId: "u-bob" },
				{ start: 13, name: "Bob", userId: "u-short" },
			],
			"@Bob Schmidt @Bob ",
			"@Anna Berger @Bob Schmidt @Bob ",
		);

		expect(anchored).toEqual([
			{ start: 13, name: "Bob Schmidt", userId: "u-bob" },
			{ start: 26, name: "Bob", userId: "u-short" },
		]);
	});

	it("keeps two mentions of the same person apart", () => {
		const anchored = reanchorMentions(
			[
				{ start: 0, name: "Bob", userId: "u-bob" },
				{ start: 9, name: "Bob", userId: "u-bob" },
			],
			"@Bob and @Bob ",
			"cc @Bob and @Bob ",
		);

		expect(anchored).toEqual([
			{ start: 3, name: "Bob", userId: "u-bob" },
			{ start: 12, name: "Bob", userId: "u-bob" },
		]);
	});

	it("drops the namesake who was deleted, not the one still in the text", () => {
		// Two people are called the same, both are mentioned, and the FIRST mention is deleted.
		// The text left behind is the same either way, so looking the name up again handed the
		// surviving mention to the deleted person — and notified them instead of the other.
		const anchored = reanchorMentions(
			[
				{ start: 6, name: "Thomas Müller", userId: "id-a" },
				{ start: 25, name: "Thomas Müller", userId: "id-b" },
			],
			"Hallo @Thomas Müller und @Thomas Müller ",
			"Hallo und @Thomas Müller ",
		);

		expect(anchored).toEqual([
			{ start: 10, name: "Thomas Müller", userId: "id-b" },
		]);
	});

	it("drops the right namesake when the second mention is the one deleted", () => {
		const anchored = reanchorMentions(
			[
				{ start: 6, name: "Thomas Müller", userId: "id-a" },
				{ start: 25, name: "Thomas Müller", userId: "id-b" },
			],
			"Hallo @Thomas Müller und @Thomas Müller ",
			"Hallo @Thomas Müller und ",
		);

		expect(anchored).toEqual([
			{ start: 6, name: "Thomas Müller", userId: "id-a" },
		]);
	});
});

describe("splitMentions", () => {
	const users = new Map([
		["Anna Berger", "u1"],
		["Bob", "u2"],
		["Bob Schmidt", "u3"],
	]);

	it("keeps text without mentions in one piece", () => {
		expect(splitMentions("nothing to see", users)).toEqual([
			{ text: "nothing to see" },
		]);
	});

	it("marks a known name as a mention", () => {
		expect(splitMentions("hi @Anna Berger, thanks", users)).toEqual([
			{ text: "hi " },
			{ text: "@Anna Berger", userId: "u1" },
			{ text: ", thanks" },
		]);
	});

	it("leaves a name nobody could resolve as plain text", () => {
		expect(splitMentions("hi @Carla Meier", users)).toEqual([
			{ text: "hi @Carla Meier" },
		]);
	});

	it("prefers the longer name", () => {
		expect(splitMentions("@Bob Schmidt is here", users)).toEqual([
			{ text: "@Bob Schmidt", userId: "u3" },
			{ text: " is here" },
		]);
	});

	it("does not read an e-mail address as a mention", () => {
		expect(splitMentions("mail@Bob now", users)).toEqual([
			{ text: "mail@Bob now" },
		]);
	});

	it("finds several mentions in one text", () => {
		expect(splitMentions("@Bob and @Anna Berger", users)).toEqual([
			{ text: "@Bob", userId: "u2" },
			{ text: " and " },
			{ text: "@Anna Berger", userId: "u1" },
		]);
	});
});
