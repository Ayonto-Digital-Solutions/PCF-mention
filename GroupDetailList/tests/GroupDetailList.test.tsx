import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	GroupDetailList,
	type GroupDetailListProps,
	type GroupDetailListStrings,
} from "../GroupDetailListControl/components/GroupDetailList";
import type { GridColumn, GridRow } from "../GroupDetailListControl/utils/dataset";

const COLUMNS: GridColumn[] = [
	{ key: "name", label: "Name", kind: "record", widthFactor: 150, sortable: true },
	{ key: "city", label: "City", kind: "text", widthFactor: 120, sortable: true },
	{ key: "email", label: "E-mail", kind: "email", widthFactor: 200, sortable: false },
	{ key: "phone", label: "Phone", kind: "phone", widthFactor: 120, sortable: true },
	{ key: "owner", label: "Owner", kind: "reference", widthFactor: 120, sortable: true },
];

const ROWS: GridRow[] = [
	{ id: "1", values: { name: "Anna", city: "Berlin", email: "anna@contoso.com", phone: "+49 30 123", owner: "Bea" } },
	{ id: "2", values: { name: "Bert", city: "Berlin", email: "", phone: "", owner: "" } },
	{ id: "3", values: { name: "Cara", city: "Hamburg", email: "", phone: "", owner: "" } },
];

const STRINGS: GroupDetailListStrings = {
	groupBy: "Group by",
	noGrouping: "No grouping",
	loading: "Loading records",
	noRecords: "No records to show",
	previousPage: "Previous",
	nextPage: "Next",
	selectAll: "Select all rows on this page",
	selectRow: "Select row",
	emptyGroup: "(empty)",
	selectionCount: (count) => `${count} selected`,
	recordCount: (loaded, total) => `${loaded} of ${total} records`,
	loadedCount: (loaded) => `${loaded} records`,
};

function setup(overrides: Partial<GroupDetailListProps> = {}) {
	const handlers = {
		onGroupColumnChange: vi.fn(),
		onSelectionChange: vi.fn(),
		onSort: vi.fn(),
		onOpenRecord: vi.fn(),
		onOpenReference: vi.fn(),
		onPreviousPage: vi.fn(),
		onNextPage: vi.fn(),
	};

	const props: GroupDetailListProps = {
		columns: COLUMNS,
		rows: ROWS,
		initialSelectedIds: [],
		groupingEnabled: true,
		isLoading: false,
		totalResultCount: 120,
		hasPreviousPage: false,
		hasNextPage: true,
		strings: STRINGS,
		formatNumber: (value) => String(value),
		sortOf: () => undefined,
		...handlers,
		...overrides,
	};

	lastProps = props;
	return { ...render(<GroupDetailList {...props} />), ...handlers };
}

let lastProps: GroupDetailListProps | undefined;

afterEach(() => {
	cleanup();
	// Fluent mounts its dropdown popup straight into the body, outside the container that
	// cleanup() removes. Left behind, every later text query scans a growing document.
	document.body.innerHTML = "";
});

describe("GroupDetailList", () => {
	it("renders a row per record with the view's columns", () => {
		setup();
		expect(screen.getAllByRole("row")).toHaveLength(ROWS.length + 1);
		COLUMNS.forEach((column) => {
			expect(screen.getByRole("columnheader", { name: column.label })).toBeTruthy();
		});
	});

	it("opens the record when the primary column is clicked", () => {
		const { onOpenRecord } = setup();
		fireEvent.click(screen.getByText("Anna"));
		expect(onOpenRecord).toHaveBeenCalledWith("1");
	});

	it("opens the referenced record, not the row, from a lookup cell", () => {
		const { onOpenReference, onOpenRecord } = setup();
		fireEvent.click(screen.getByText("Bea"));
		expect(onOpenReference).toHaveBeenCalledWith("1", "owner");
		expect(onOpenRecord).not.toHaveBeenCalled();
	});

	it("links an e-mail address and a phone number", () => {
		setup();
		// RFC 6068 keeps the "@": encoding it away leaves the address without its delimiter.
		expect(screen.getByText("anna@contoso.com").getAttribute("href")).toBe("mailto:anna@contoso.com");
		expect(screen.getByText("+49 30 123").getAttribute("href")).toBe("tel:+4930123");
	});

	it("opens the record on a double click", () => {
		const { onOpenRecord } = setup();
		fireEvent.doubleClick(screen.getByText("Cara").closest("tr")!);
		expect(onOpenRecord).toHaveBeenCalledWith("3");
	});

	it("opens the record once when the primary column itself is double-clicked", () => {
		// The cell opens the record and so does the row; without isolation the platform is asked
		// to open the same record three times for one gesture.
		const { onOpenRecord } = setup();
		const cell = screen.getByText("Anna");

		// What a browser actually dispatches for a double click.
		fireEvent.click(cell, { detail: 1 });
		fireEvent.click(cell, { detail: 2 });
		fireEvent.doubleClick(cell);

		expect(onOpenRecord).toHaveBeenCalledTimes(1);
	});

	it("does not open the record when the selection cell is double-clicked", () => {
		const { onOpenRecord } = setup();
		const selectionCell = screen.getByText("Anna").closest("tr")!.querySelector("td")!;

		fireEvent.doubleClick(selectionCell);

		expect(onOpenRecord).not.toHaveBeenCalled();
	});

	it("leaves a phone value that is not one plain number as text", () => {
		// Stripping to digits would glue the extension onto the number and dial someone else.
		const rows = [{ id: "1", values: { ...ROWS[0].values, phone: "030/12345 ext. 6" } }];
		setup({ rows });

		expect(screen.getByText("030/12345 ext. 6").tagName).not.toBe("A");
	});

	it("still dials a number written with separators", () => {
		const rows = [{ id: "1", values: { ...ROWS[0].values, phone: "(030) 123-45" } }];
		setup({ rows });

		expect(screen.getByText("(030) 123-45").getAttribute("href")).toBe("tel:03012345");
	});

	it("does not present an unsortable column as sortable to assistive technology", () => {
		setup();
		expect(screen.getByRole("columnheader", { name: "E-mail" }).getAttribute("aria-sort")).toBeNull();
		expect(screen.getByRole("columnheader", { name: "Name" }).getAttribute("aria-sort")).toBe("none");
	});

	it("asks for a sort when a sortable header is clicked", () => {
		const { onSort } = setup();
		fireEvent.click(screen.getByRole("columnheader", { name: "City" }));
		expect(onSort).toHaveBeenCalledWith("city");
	});

	it("does not sort a column the view marked as not sortable", () => {
		const { onSort } = setup();
		fireEvent.click(screen.getByRole("columnheader", { name: "E-mail" }));
		expect(onSort).not.toHaveBeenCalled();
	});

	it("marks the sorted column for screen readers", () => {
		setup({ sortOf: (key) => (key === "city" ? "descending" : undefined) });
		expect(screen.getByRole("columnheader", { name: "City" }).getAttribute("aria-sort")).toBe("descending");
		expect(screen.getByRole("columnheader", { name: "Name" }).getAttribute("aria-sort")).toBe("none");
	});

	it("hides the group picker when grouping is switched off in the configuration", () => {
		setup({ groupingEnabled: false });
		expect(screen.queryByRole("combobox")).toBeNull();
		expect(screen.queryByText("Group by")).toBeNull();
	});

	it("starts from whatever the dataset already had selected", () => {
		setup({ initialSelectedIds: ["1", "2"] });
		expect(screen.getByText("2 selected")).toBeTruthy();
		expect(screen.getByText("3 of 120 records")).toBeTruthy();
	});

	it("counts what is loaded when the server does not report a total", () => {
		setup({ totalResultCount: undefined });
		expect(screen.getByText("3 records")).toBeTruthy();
	});

	const selectionCellOf = (text: string) =>
		screen.getByText(text).closest("tr")!.querySelector("td")!;

	it("selects a row on the spot and reports it to the dataset", () => {
		const { onSelectionChange } = setup();

		fireEvent.click(selectionCellOf("Anna"));

		expect(screen.getByText("1 selected")).toBeTruthy();
		expect(onSelectionChange).toHaveBeenCalledWith(["1"]);
	});

	it("deselects a row that was selected", () => {
		const { onSelectionChange } = setup({ initialSelectedIds: ["1"] });

		fireEvent.click(selectionCellOf("Anna"));

		expect(screen.getByText("0 selected")).toBeTruthy();
		expect(onSelectionChange).toHaveBeenLastCalledWith([]);
	});

	it("selects and clears every row on the page from the header", () => {
		const { onSelectionChange } = setup();
		const header = screen.getByRole("columnheader", { name: "Name" }).closest("tr")!;
		const selectAll = header.querySelector("td")!;

		fireEvent.click(selectAll);
		expect(screen.getByText("3 selected")).toBeTruthy();
		expect(onSelectionChange).toHaveBeenLastCalledWith(["1", "2", "3"]);

		fireEvent.click(selectAll);
		expect(screen.getByText("0 selected")).toBeTruthy();
		expect(onSelectionChange).toHaveBeenLastCalledWith([]);
	});

	it("drops a selected record that is no longer on the loaded page", () => {
		const { rerender, onSelectionChange } = setup({ initialSelectedIds: ["1", "3"] });
		expect(screen.getByText("2 selected")).toBeTruthy();

		rerender(<GroupDetailList {...lastProps!} rows={ROWS.slice(0, 2)} />);

		expect(screen.getByText("1 selected")).toBeTruthy();
		expect(onSelectionChange).toHaveBeenLastCalledWith(["1"]);
	});

	it("adopts a selection the dataset only reports after loading", () => {
		// The first update usually arrives while the dataset is still loading, so the platform's
		// existing selection shows up on a later one.
		const { rerender, container } = setup({ initialSelectedIds: [] });
		expect(screen.getByText("0 selected")).toBeTruthy();

		rerender(<GroupDetailList {...lastProps!} initialSelectedIds={["1", "2"]} />);

		expect(screen.getByText("2 selected")).toBeTruthy();
		expect(container.querySelectorAll('tbody tr[aria-selected="true"], tbody tr').length).toBeGreaterThan(0);
	});

	it("does not let a late dataset selection overrule what the user picked", () => {
		const { rerender } = setup({ initialSelectedIds: [] });
		fireEvent.click(screen.getByText("Cara").closest("tr")!.querySelector("td")!);
		expect(screen.getByText("1 selected")).toBeTruthy();

		rerender(<GroupDetailList {...lastProps!} initialSelectedIds={["1", "2"]} />);

		expect(screen.getByText("1 selected")).toBeTruthy();
	});

	it("marks the header checkbox mixed while only some rows are selected", () => {
		const { container } = setup({ initialSelectedIds: ["1"] });
		const headerCheckbox = container.querySelector<HTMLInputElement>('thead input[type="checkbox"]')!;

		expect(headerCheckbox.indeterminate).toBe(true);
		expect(headerCheckbox.checked).toBe(false);
	});

	it("checks the header checkbox once every row is selected", () => {
		const { container } = setup({ initialSelectedIds: ["1", "2", "3"] });
		const headerCheckbox = container.querySelector<HTMLInputElement>('thead input[type="checkbox"]')!;

		expect(headerCheckbox.checked).toBe(true);
		expect(headerCheckbox.indeterminate).toBe(false);
	});

	it("leaves an empty cell empty instead of linking nothing", () => {
		// Row 2 has no e-mail, no phone and no owner.
		const { container } = setup();
		const secondRow = screen.getByText("Bert").closest("tr")!;

		expect(secondRow.querySelectorAll("a")).toHaveLength(0);
		expect(container.querySelector('a[href="mailto:"]')).toBeNull();
	});

	it("names a group of records that have no value for the column", () => {
		const rows = [
			{ id: "1", values: { ...ROWS[0].values, city: "Berlin" } },
			{ id: "2", values: { ...ROWS[1].values, city: "" } },
		];
		const { container } = setup({ rows, sortOf: (key) => (key === "city" ? "ascending" : undefined) });

		pickGroupColumn("City");

		expect(groupHeaders(container)).toEqual(["Berlin(1)", "(empty)(1)"]);
	});

	it("does not re-report when the same records come back in a new array", () => {
		// index.ts rebuilds the row array on every update; reacting to that identity would
		// report the selection back on every single one.
		const { rerender, onSelectionChange } = setup({ initialSelectedIds: ["1"] });
		onSelectionChange.mockClear();

		rerender(<GroupDetailList {...lastProps!} rows={[...ROWS]} />);

		expect(onSelectionChange).not.toHaveBeenCalled();
		expect(screen.getByText("1 selected")).toBeTruthy();
	});

	it("re-reports the selection when the records are reordered by a sort", () => {
		const { rerender, onSelectionChange } = setup({ initialSelectedIds: ["1"] });
		onSelectionChange.mockClear();

		rerender(<GroupDetailList {...lastProps!} rows={[...ROWS].reverse()} />);

		expect(onSelectionChange).toHaveBeenCalledWith(["1"]);
	});

	it("does not offer a column for grouping that the view forbids sorting", () => {
		// Grouping sorts by the column, so an unsortable column cannot be grouped either.
		setup();
		fireEvent.click(screen.getByRole("combobox"));

		const offered = screen.getAllByRole("option").map((option) => option.textContent);
		expect(offered).not.toContain("E-mail");
		expect(offered).toContain("City");
	});

	it("pages forward and backward only where the dataset allows it", () => {
		const { onNextPage, onPreviousPage } = setup();
		const previous = screen.getByRole("button", { name: "Previous" });
		const next = screen.getByRole("button", { name: "Next" });

		expect(previous.hasAttribute("disabled")).toBe(true);
		fireEvent.click(next);
		expect(onNextPage).toHaveBeenCalledTimes(1);
		fireEvent.click(previous);
		expect(onPreviousPage).not.toHaveBeenCalled();
	});

	it("shows a spinner while the first page is loading", () => {
		setup({ isLoading: true, rows: [] });
		expect(screen.getByText("Loading records")).toBeTruthy();
		expect(screen.queryByRole("row")).toBeNull();
	});

	it("says so when the view is empty", () => {
		setup({ rows: [] });
		expect(screen.getByText("No records to show")).toBeTruthy();
	});

	it("surfaces a dataset error", () => {
		setup({ errorMessage: "The view could not be loaded." });
		expect(screen.getByText("The view could not be loaded.")).toBeTruthy();
	});
	const groupHeaders = (container: HTMLElement) =>
		// A group header spans the whole table, so it is the row with a single wide cell.
		Array.from(container.querySelectorAll("tbody tr"))
			.filter((row) => row.querySelectorAll("td").length === 1)
			.map((row) => row.textContent);

	const pickGroupColumn = (label: string) => {
		fireEvent.click(screen.getByRole("combobox"));
		fireEvent.click(screen.getByRole("option", { name: label }));
	};

	// The whole round trip through the picker, in one test.
	// Picking a group column sorts the dataset by it; grouping only holds once that sort landed.
	const sortedByCity = (key: string) => (key === "city" ? ("ascending" as const) : undefined);

	it("groups by the picked column and returns to a flat list", () => {
		const { container, onGroupColumnChange } = setup({ sortOf: sortedByCity });
		expect(groupHeaders(container)).toEqual([]);

		pickGroupColumn("City");

		expect(groupHeaders(container)).toEqual(["Berlin(2)", "Hamburg(1)"]);
		expect(onGroupColumnChange).toHaveBeenCalledWith("city");

		pickGroupColumn("No grouping");

		expect(groupHeaders(container)).toEqual([]);
		expect(onGroupColumnChange).toHaveBeenLastCalledWith(undefined);
	});

	it("does not group while the dataset is not sorted by the group column", () => {
		// Chunking consecutive rows would otherwise split one value across several headers.
		const { container } = setup({ sortOf: () => undefined });

		pickGroupColumn("City");

		expect(groupHeaders(container)).toEqual([]);
	});

	it("stops grouping when the group column leaves the view", () => {
		const { container, rerender } = setup({ sortOf: sortedByCity });
		pickGroupColumn("City");
		expect(groupHeaders(container)).toEqual(["Berlin(2)", "Hamburg(1)"]);

		rerender(
			<GroupDetailList {...lastProps!} columns={COLUMNS.filter((column) => column.key !== "city")} />
		);

		expect(groupHeaders(container)).toEqual([]);
	});

	it("offers every column plus the ungrouped option", () => {
		setup();
		fireEvent.click(screen.getByRole("combobox"));

		expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
			"No grouping",
			...COLUMNS.filter((column) => column.sortable).map((column) => column.label),
		]);
	});
});
