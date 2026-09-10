import { describe, expect, it } from "vitest";
import {
	MAX_QUERY_LENGTH,
	applyMention,
	buildRecordUrl,
	escapeHtml,
	escapeODataLiteral,
	findMentionTrigger,
	normalizeGuid,
} from "../MentionControl/utils/mentionText";

describe("findMentionTrigger", () => {
	it("finds a trigger at the start of the text", () => {
		expect(findMentionTrigger("@Ann", 4)).toEqual({ start: 0, end: 4, query: "Ann" });
	});

	it("finds a trigger that follows whitespace", () => {
		expect(findMentionTrigger("hi @Ann", 7)).toEqual({ start: 3, end: 7, query: "Ann" });
	});

	it("allows one space inside the query, because user names contain one", () => {
		expect(findMentionTrigger("cc @Ann Smi", 11)).toEqual({ start: 3, end: 11, query: "Ann Smi" });
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
		expect(findMentionTrigger("@Bo @An", 7)).toEqual({ start: 4, end: 7, query: "An" });
	});

	it("returns null for a caret outside the text", () => {
		expect(findMentionTrigger("@Ann", 99)).toBeNull();
	});
});

describe("applyMention", () => {
	it("replaces the query with the full name and appends a separating space", () => {
		const trigger = findMentionTrigger("hi @An", 6);
		expect(trigger).not.toBeNull();
		expect(applyMention("hi @An", trigger!, "Ann Smith")).toEqual({ text: "hi @Ann Smith ", caret: 14 });
	});

	it("keeps whatever followed the caret", () => {
		const trigger = findMentionTrigger("hi @An, bye", 6);
		expect(applyMention("hi @An, bye", trigger!, "Ann Smith").text).toBe("hi @Ann Smith , bye");
	});

	it("does not add a second space when one is already there", () => {
		const trigger = findMentionTrigger("hi @An bye", 6);
		expect(applyMention("hi @An bye", trigger!, "Ann Smith")).toEqual({ text: "hi @Ann Smith bye", caret: 13 });
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
