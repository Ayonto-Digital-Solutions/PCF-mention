import { describe, expect, it } from "vitest";
import {
	DEFAULT_ROWS,
	HYSTERESIS_PX,
	MAX_ROWS,
	MIN_ROWS,
	clampRows,
	minHeight,
	nextGiven,
	type GivenHeight,
} from "../MentionControl/utils/hostHeight";

describe("clampRows", () => {
	it("keeps a sensible number", () => {
		expect(clampRows(5)).toBe(5);
	});

	it("falls back when the property is empty", () => {
		// The platform hands over null for a number field nobody filled in.
		expect(clampRows(null)).toBe(DEFAULT_ROWS);
		expect(clampRows(undefined)).toBe(DEFAULT_ROWS);
	});

	it("falls back on anything that is not a number", () => {
		expect(clampRows(Number.NaN)).toBe(DEFAULT_ROWS);
		expect(clampRows(Number.POSITIVE_INFINITY)).toBe(DEFAULT_ROWS);
		expect(clampRows("4" as unknown as number)).toBe(DEFAULT_ROWS);
	});

	it("refuses a height nobody can type in", () => {
		expect(clampRows(0)).toBe(MIN_ROWS);
		expect(clampRows(-5)).toBe(MIN_ROWS);
	});

	it("refuses a height that would swallow the form", () => {
		expect(clampRows(500)).toBe(MAX_ROWS);
	});

	it("takes a fraction to the nearest row", () => {
		expect(clampRows(4.4)).toBe(4);
		expect(clampRows(4.6)).toBe(5);
	});
});

describe("minHeight", () => {
	const lineHeight = 20;

	it("uses the rows where the form asks for nothing", () => {
		expect(minHeight(0, 3, lineHeight)).toBe(60);
	});

	it("uses the form where it asks for more", () => {
		expect(minHeight(200, 3, lineHeight)).toBe(200);
	});

	it("uses the form even where it asks for less than the rows", () => {
		// A cell shorter than the configured row count is an instruction, not an accident. The
		// row count is the fallback, not a floor under the form.
		expect(minHeight(40, 3, lineHeight)).toBe(40);
	});

	it("obeys a cell that asks for a single row", () => {
		// This is the case that tells a measurement from a fallback in a real form: a one-row
		// cell and a cell with no height at all would otherwise render exactly alike.
		expect(minHeight(lineHeight, 3, lineHeight)).toBe(lineHeight);
	});

	it("counts padding and border where the box does", () => {
		expect(minHeight(0, 3, lineHeight, 14)).toBe(74);
	});
});

describe("nextGiven", () => {
	/** The first reading is the only one that can tell a given height from a hugging box. */
	const first = (host: number, own: number, slack?: number): GivenHeight =>
		nextGiven(null, { host, own }, slack);

	it("takes a box with room to spare as the form's ask", () => {
		expect(first(200, 80)).toEqual({ fromForm: 200, ownAtReading: 80 });
	});

	it("reads a box that merely hugs the editor as no ask at all", () => {
		// Nothing about a box that is exactly as tall as its content says what the form wanted.
		expect(first(80, 80)).toEqual({ fromForm: 0, ownAtReading: 80 });
	});

	it("reads a box of zero as no ask at all", () => {
		expect(first(0, 0).fromForm).toBe(0);
	});

	it("does not follow the editor's own growth", () => {
		// The editor grew by 40, and the box grew by 40 because of it. The form still wants 100.
		const start = { fromForm: 100, ownAtReading: 100 };
		expect(nextGiven(start, { host: 140, own: 140 })).toEqual({
			fromForm: 100,
			ownAtReading: 140,
		});
	});

	it("keeps following the form after the editor grew", () => {
		// The yardstick moved with the editor, so the next change is still read correctly.
		const grown = nextGiven(
			{ fromForm: 100, ownAtReading: 100 },
			{ host: 140, own: 140 },
		);
		expect(nextGiven(grown, { host: 220, own: 140 }).fromForm).toBe(220);
	});

	it("ignores a change too small to be the form", () => {
		const start = { fromForm: 100, ownAtReading: 100 };
		expect(nextGiven(start, { host: 101, own: 100 })).toBe(start);
		expect(HYSTERESIS_PX).toBe(2);
	});

	it("follows a change that is clearly the form", () => {
		const start = { fromForm: 100, ownAtReading: 100 };
		expect(nextGiven(start, { host: 140, own: 100 })).toEqual({
			fromForm: 140,
			ownAtReading: 100,
		});
	});

	it("follows the form downwards too", () => {
		const start = { fromForm: 200, ownAtReading: 100 };
		expect(nextGiven(start, { host: 120, own: 100 }).fromForm).toBe(120);
	});

	it("does not take the host's padding for a form height", () => {
		// A box with ten pixels to spare around the editor is a padded container, not a form that
		// asked for a tall field. Following it would pin the minimum to whatever the column
		// happened to contain when the form opened — a field that can never be made small again.
		expect(first(90, 80, 20).fromForm).toBe(0);
	});

	it("takes a full row of room to spare as the form's ask", () => {
		expect(first(101, 80, 20).fromForm).toBe(101);
	});

	it("does not drift when the same reading comes again and again", () => {
		let given = first(200, 80);
		for (let round = 0; round < 20; round += 1) {
			given = nextGiven(given, { host: 200, own: 200 });
		}
		expect(given.fromForm).toBe(200);
	});
});
