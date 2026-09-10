/**
 * Pure translation between the framework's dataset shape and what the grid renders.
 * Free of React and of the platform, so the mapping and grouping rules can be tested on
 * plain objects.
 */

type Column = ComponentFramework.PropertyHelper.DataSetApi.Column;
type SortStatus = ComponentFramework.PropertyHelper.DataSetApi.SortStatus;

/** How a cell is presented. */
export type CellKind = "text" | "record" | "reference" | "email" | "phone";

export interface GridColumn {
	/** Unique column name inside the dataset. */
	readonly key: string;
	readonly label: string;
	readonly kind: CellKind;
	/** Relative width the view asks for. */
	readonly widthFactor: number;
	readonly sortable: boolean;
}

export interface GridRow {
	readonly id: string;
	readonly values: Readonly<Record<string, string>>;
}

export interface RowGroup {
	readonly key: string;
	/** The formatted value the rows share, or undefined when that value is empty. */
	readonly label?: string;
	readonly rows: readonly GridRow[];
}

export type SortDirection = "ascending" | "descending";

/** Dataverse reports ascending as 0 and descending as 1. */
const DESCENDING = 1;

function kindOf(column: Column): CellKind {
	if (column.isPrimary) {
		return "record";
	}
	if (column.dataType.startsWith("Lookup.")) {
		return "reference";
	}
	if (column.dataType === "SingleLine.Email") {
		return "email";
	}
	if (column.dataType === "SingleLine.Phone") {
		return "phone";
	}
	return "text";
}

/** Visible columns of the view, in the order the view defines. */
export function toGridColumns(columns: readonly Column[] | undefined): GridColumn[] {
	return (columns ?? [])
		.filter((column) => !column.isHidden)
		.slice()
		.sort((left, right) => left.order - right.order)
		.map((column) => ({
			key: column.name,
			label: column.displayName,
			kind: kindOf(column),
			widthFactor: column.visualSizeFactor > 0 ? column.visualSizeFactor : 100,
			sortable: !column.disableSorting,
		}));
}

/** The loaded page of records, in the order the server returned them. */
export function toGridRows(
	sortedRecordIds: readonly string[] | undefined,
	records: Readonly<Record<string, ComponentFramework.PropertyHelper.DataSetApi.EntityRecord>> | undefined,
	columns: readonly GridColumn[]
): GridRow[] {
	const rows: GridRow[] = [];

	for (const id of sortedRecordIds ?? []) {
		const record = records?.[id];
		if (!record) {
			continue;
		}

		const values: Record<string, string> = {};
		for (const column of columns) {
			values[column.key] = record.getFormattedValue(column.key) || "";
		}
		rows.push({ id, values });
	}

	return rows;
}

/**
 * Chunks consecutive rows that share a value into groups.
 *
 * This relies on the dataset already being sorted by that column, which is what selecting a
 * group column does — grouping a single loaded page client-side would put the same value into
 * several groups as soon as the view spans more than one page.
 */
export function groupRows(
	rows: readonly GridRow[],
	columnKey: string | undefined
): RowGroup[] | undefined {
	if (!columnKey) {
		return undefined;
	}

	const groups: { key: string; label?: string; rows: GridRow[] }[] = [];
	for (const row of rows) {
		const raw = row.values[columnKey] ?? "";
		const label = raw.length > 0 ? raw : undefined;
		const current = groups[groups.length - 1];

		if (current && current.label === label) {
			current.rows.push(row);
		} else {
			groups.push({ key: `${columnKey}:${raw}:${groups.length.toString()}`, label, rows: [row] });
		}
	}

	return groups;
}

/**
 * The direction the dataset is currently sorted in for one column, if any.
 *
 * The typings declare sorting, paging and records as always present, but the framework leaves
 * them undefined until a dataset has loaded, so every reader here tolerates that.
 */
export function sortDirectionOf(
	sorting: readonly SortStatus[] | undefined,
	columnKey: string
): SortDirection | undefined {
	const status = sorting?.find((entry) => entry.name === columnKey);
	if (!status) {
		return undefined;
	}
	return status.sortDirection === DESCENDING ? "descending" : "ascending";
}

/** Clicking a sorted column flips it; clicking any other column sorts it ascending. */
export function nextSorting(sorting: readonly SortStatus[] | undefined, columnKey: string): SortStatus[] {
	const current = sortDirectionOf(sorting, columnKey);
	const sortDirection = current === "ascending" ? DESCENDING : 0;
	return [{ name: columnKey, sortDirection: sortDirection as SortStatus["sortDirection"] }];
}

/**
 * The 1-based position of the loaded page. The framework reports the page range rather than a
 * single page, so the first page number is what identifies where the user is.
 */
export function currentPageNumber(firstPageNumber: number): number {
	return firstPageNumber > 0 ? firstPageNumber : 1;
}

/** Dataverse reports -1, or nothing at all, when it does not know how many records match. */
export function hasKnownTotal(totalResultCount: number | undefined): boolean {
	return totalResultCount !== undefined && totalResultCount >= 0;
}
