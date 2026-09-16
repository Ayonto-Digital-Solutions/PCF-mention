import { describe, expect, it } from "vitest";
import {
	MULTIPLE,
	SINGLE_LINE_TEXT,
	SINGLE_LINE_TEXT_AREA,
	SUPPORTED_COLUMN_TYPES,
	fallbackRows,
	isSingleLine,
	withoutLineBreaks,
} from "../MentionControl/utils/columnType";

describe("the supported column types", () => {
	it("are the three text column types Dataverse has", () => {
		expect([...SUPPORTED_COLUMN_TYPES].sort()).toEqual(
			[MULTIPLE, SINGLE_LINE_TEXT, SINGLE_LINE_TEXT_AREA].sort(),
		);
	});
});

describe("isSingleLine", () => {
	it("knows the one type that holds a single line", () => {
		expect(isSingleLine(SINGLE_LINE_TEXT)).toBe(true);
	});

	it("leaves the two multi-line types alone", () => {
		expect(isSingleLine(MULTIPLE)).toBe(false);
		expect(isSingleLine(SINGLE_LINE_TEXT_AREA)).toBe(false);
	});

	it("treats a type it cannot read as multi-line", () => {
		// The editor is built for several lines. A component that does not know what it is bound
		// to should not be the one that makes the field smaller.
		expect(isSingleLine(undefined)).toBe(false);
		expect(isSingleLine(null)).toBe(false);
		expect(isSingleLine("")).toBe(false);
		expect(isSingleLine("SingleLine.Email")).toBe(false);
	});
});

describe("fallbackRows", () => {
	it("gives a single line column one row and no say to the property", () => {
		expect(fallbackRows(SINGLE_LINE_TEXT, 7)).toBe(1);
		expect(fallbackRows(SINGLE_LINE_TEXT, 30)).toBe(1);
	});

	it("passes the configured count through for the multi-line types", () => {
		expect(fallbackRows(MULTIPLE, 7)).toBe(7);
		expect(fallbackRows(SINGLE_LINE_TEXT_AREA, 7)).toBe(7);
	});
});

describe("withoutLineBreaks", () => {
	it("turns every kind of line break into one space", () => {
		expect(withoutLineBreaks("a\nb")).toBe("a b");
		expect(withoutLineBreaks("a\r\nb")).toBe("a b");
		expect(withoutLineBreaks("a\rb")).toBe("a b");
	});

	it("keeps one space per break, so the caret does not move further than the text", () => {
		expect(withoutLineBreaks("a\n\nb")).toBe("a  b");
	});

	it("leaves text without breaks exactly as it is", () => {
		expect(withoutLineBreaks("hi @Anna Berger ")).toBe("hi @Anna Berger ");
	});
});
