import { describe, expect, it } from "vitest";
import {
	currentPageNumber,
	groupRows,
	hasKnownTotal,
	nextSorting,
	sortDirectionOf,
	toGridColumns,
	toGridRows,
	type GridRow,
} from "../GroupDetailListControl/utils/dataset";

type Column = ComponentFramework.PropertyHelper.DataSetApi.Column;
type SortStatus = ComponentFramework.PropertyHelper.DataSetApi.SortStatus;

const column = (over: Partial<Column> = {}): Column =>
	({
		name: "name",
		displayName: "Name",
		dataType: "SingleLine.Text",
		alias: "name",
		order: 0,
		visualSizeFactor: 150,
		...over,
	}) as Column;

const record = (values: Record<string, string>) =>
	({
		getFormattedValue: (key: string) => values[key] ?? "",
		getRecordId: () => "r",
		getValue: () => "",
		getNamedReference: () => ({ id: { guid: "r" } }),
	}) as unknown as ComponentFramework.PropertyHelper.DataSetApi.EntityRecord;

describe("toGridColumns", () => {
	it("keeps the order the view defines", () => {
		const result = toGridColumns([
			column({ name: "b", order: 2 }),
			column({ name: "a", order: 1 }),
		]);
		expect(result.map((c) => c.key)).toEqual(["a", "b"]);
	});

	it("leaves out hidden columns", () => {
		const result = toGridColumns([column({ name: "a" }), column({ name: "b", isHidden: true })]);
		expect(result.map((c) => c.key)).toEqual(["a"]);
	});

	it("renders the primary column as a link to its own record", () => {
		expect(toGridColumns([column({ isPrimary: true })])[0].kind).toBe("record");
	});

	it("renders a lookup as a link to the referenced record", () => {
		expect(toGridColumns([column({ dataType: "Lookup.Simple" })])[0].kind).toBe("reference");
	});

	it("recognises e-mail and phone columns", () => {
		expect(toGridColumns([column({ dataType: "SingleLine.Email" })])[0].kind).toBe("email");
		expect(toGridColumns([column({ dataType: "SingleLine.Phone" })])[0].kind).toBe("phone");
	});

	it("treats everything else as plain text", () => {
		expect(toGridColumns([column({ dataType: "Whole.None" })])[0].kind).toBe("text");
	});

	it("survives a column the framework hands out without a data type", () => {
		expect(
			toGridColumns([column({ dataType: null as unknown as string, isPrimary: false })])[0].kind
		).toBe("text");
	});

	it("falls back to a usable width when the view reports none", () => {
		expect(toGridColumns([column({ visualSizeFactor: 0 })])[0].widthFactor).toBe(100);
	});

	it("respects a column that the view marks as not sortable", () => {
		expect(toGridColumns([column({ disableSorting: true })])[0].sortable).toBe(false);
		expect(toGridColumns([column()])[0].sortable).toBe(true);
	});
});

describe("toGridRows", () => {
	const columns = toGridColumns([column({ name: "name" }), column({ name: "city", order: 1 })]);

	it("reads the formatted value of every column", () => {
		const rows = toGridRows(["r1"], { r1: record({ name: "Anna", city: "Berlin" }) }, columns);
		expect(rows).toEqual([{ id: "r1", values: { name: "Anna", city: "Berlin" } }]);
	});

	it("keeps the order the server returned", () => {
		const rows = toGridRows(
			["r2", "r1"],
			{ r1: record({ name: "Anna" }), r2: record({ name: "Bea" }) },
			columns
		);
		expect(rows.map((row) => row.id)).toEqual(["r2", "r1"]);
	});

	it("skips an id the dataset has no record for", () => {
		const rows = toGridRows(["r1", "gone"], { r1: record({ name: "Anna" }) }, columns);
		expect(rows.map((row) => row.id)).toEqual(["r1"]);
	});
});

describe("groupRows", () => {
	const rows: GridRow[] = [
		{ id: "1", values: { city: "Berlin" } },
		{ id: "2", values: { city: "Berlin" } },
		{ id: "3", values: { city: "Hamburg" } },
		{ id: "4", values: { city: "" } },
	];

	it("returns nothing when no column is grouped", () => {
		expect(groupRows(rows, undefined)).toBeUndefined();
	});

	it("chunks consecutive rows that share the value", () => {
		const groups = groupRows(rows, "city");
		expect(groups?.map((group) => [group.label, group.rows.length])).toEqual([
			["Berlin", 2],
			["Hamburg", 1],
			[undefined, 1],
		]);
	});

	it("keeps a repeated value apart when it is not consecutive", () => {
		const groups = groupRows(
			[
				{ id: "1", values: { city: "Berlin" } },
				{ id: "2", values: { city: "Hamburg" } },
				{ id: "3", values: { city: "Berlin" } },
			],
			"city"
		);
		expect(groups).toHaveLength(3);
		expect(groups?.map((group) => group.key)).toHaveLength(new Set(groups?.map((g) => g.key)).size);
	});

	it("returns an empty list for no rows", () => {
		expect(groupRows([], "city")).toEqual([]);
	});
});

describe("sorting", () => {
	const ascending: SortStatus[] = [{ name: "city", sortDirection: 0 }];
	const descending: SortStatus[] = [{ name: "city", sortDirection: 1 }];

	it("reports the direction of a sorted column", () => {
		expect(sortDirectionOf(ascending, "city")).toBe("ascending");
		expect(sortDirectionOf(descending, "city")).toBe("descending");
	});

	it("reports nothing for a column that is not sorted", () => {
		expect(sortDirectionOf(ascending, "name")).toBeUndefined();
	});

	it("treats the framework's 'None' direction as unsorted, not as ascending", () => {
		const none = [{ name: "city", sortDirection: -1 }] as unknown as SortStatus[];
		expect(sortDirectionOf(none, "city")).toBeUndefined();
	});

	it("flips the direction of the column that is already sorted", () => {
		expect(nextSorting(ascending, "city")).toEqual([{ name: "city", sortDirection: 1 }]);
		expect(nextSorting(descending, "city")).toEqual([{ name: "city", sortDirection: 0 }]);
	});

	it("sorts a different column ascending first", () => {
		expect(nextSorting(descending, "name")).toEqual([{ name: "name", sortDirection: 0 }]);
	});

	it("replaces the sort rather than adding to it", () => {
		expect(nextSorting([...ascending, { name: "name", sortDirection: 0 }], "city")).toHaveLength(1);
	});

	it("keeps the group column leading when another column is sorted", () => {
		// Grouping chunks consecutive rows, so the group column has to stay the primary sort.
		expect(nextSorting(ascending, "name", "city")).toEqual([
			{ name: "city", sortDirection: 0 },
			{ name: "name", sortDirection: 0 },
		]);
	});

	it("keeps the group column's own direction while sorting another column", () => {
		expect(nextSorting(descending, "name", "city")).toEqual([
			{ name: "city", sortDirection: 1 },
			{ name: "name", sortDirection: 0 },
		]);
	});

	it("does not repeat the group column when it is the one being sorted", () => {
		expect(nextSorting(ascending, "city", "city")).toEqual([{ name: "city", sortDirection: 1 }]);
	});
});

describe("paging helpers", () => {
	it("treats a negative total as unknown", () => {
		expect(hasKnownTotal(-1)).toBe(false);
		expect(hasKnownTotal(0)).toBe(true);
		expect(hasKnownTotal(120)).toBe(true);
	});

	it("reports a first page when the framework has not numbered one yet", () => {
		expect(currentPageNumber(0)).toBe(1);
		expect(currentPageNumber(3)).toBe(3);
	});
});
