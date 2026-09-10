import * as React from "react";
import type { Theme } from "@fluentui/react-components";
import type { IInputs, IOutputs } from "./generated/ManifestTypes";
import {
	GroupDetailList,
	type GroupDetailListProps,
	type GroupDetailListStrings,
} from "./components/GroupDetailList";
import { interpolate } from "./utils/format";
import {
	currentPageNumber,
	groupRows,
	hasKnownTotal,
	nextSorting,
	sortDirectionOf,
	toGridColumns,
	toGridRows,
	type GridColumn,
	type GridRow,
	type SortDirection,
} from "./utils/dataset";

type SortStatus = ComponentFramework.PropertyHelper.DataSetApi.SortStatus;

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type EntityReference = ComponentFramework.EntityReference;

/** Value of the enableGrouping choice that switches the group picker on. */
const GROUPING_ENABLED = "0";
const DEFAULT_PAGE_SIZE = 50;

export class GroupDetailListControl implements ComponentFramework.ReactControl<IInputs, IOutputs> {
	private context: ComponentFramework.Context<IInputs>;

	private columns: GridColumn[] = [];
	private rows: GridRow[] = [];
	private initialSelectedIds: string[] = [];
	private groupColumnKey: string | undefined;
	/** The sorting the rows on screen were fetched under, not the one that was just requested. */
	private appliedSorting: SortStatus[] = [];
	/** Whether the sort behind the group column has already been asked for once. */
	private groupSortRequested = false;
	private appliedPageSize = 0;
	/** The selection last reported by the component, so it survives a refresh. */
	private selection: string[] = [];
	private mustReapplySelection = false;
	private isDisposed = false;

	public init(context: ComponentFramework.Context<IInputs>): void {
		this.context = context;
	}

	public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
		this.context = context;
		const dataset = context.parameters.listDataSet;

		this.applyPageSize(dataset);

		if (!dataset.loading) {
			this.columns = toGridColumns(dataset.columns);
			this.rows = toGridRows(dataset.sortedRecordIds, dataset.records, this.columns);

			// A subgrid can switch views under the control. Keeping a group column that is no
			// longer in the view would keep injecting it as the leading ORDER BY on every sort,
			// against a column the user can neither see nor unset.
			if (this.groupColumnKey && !this.columns.some((column) => column.key === this.groupColumnKey)) {
				this.groupColumnKey = undefined;
			}
			// Copied, because the array is replaced in place on the next sort: what is kept here is
			// the order these rows actually came back in, which is what grouping may rely on.
			this.appliedSorting = (dataset.sorting ?? []).map((entry) => ({
				name: entry.name,
				sortDirection: entry.sortDirection,
			}));
			this.keepGroupColumnSorted(dataset);
			this.initialSelectedIds = dataset.getSelectedRecordIds?.() ?? [];
			this.reapplySelection(dataset);
		}

		const props: GroupDetailListProps = {
			columns: this.columns,
			rows: this.rows,
			initialSelectedIds: this.initialSelectedIds,
			groupColumnKey: this.groupColumnKey,
			groupedBy: this.groupedBy(),
			groupingEnabled: context.parameters.enableGrouping.raw === GROUPING_ENABLED,
			isLoading: dataset.loading,
			errorMessage: dataset.error ? dataset.errorMessage : undefined,
			totalResultCount: hasKnownTotal(dataset.paging?.totalResultCount)
				? dataset.paging.totalResultCount
				: undefined,
			hasPreviousPage: (dataset.paging?.hasPreviousPage ?? false) && !dataset.loading,
			hasNextPage: (dataset.paging?.hasNextPage ?? false) && !dataset.loading,
			theme: context.fluentDesignLanguage?.tokenTheme as Theme | undefined,
			strings: this.getStrings(),
			formatNumber: this.formatNumber,
			sortOf: this.sortOf,
			onGroupColumnChange: this.onGroupColumnChange,
			onSelectionChange: this.onSelectionChange,
			onSort: this.onSort,
			onOpenRecord: this.onOpenRecord,
			onOpenReference: this.onOpenReference,
			onPreviousPage: this.onPreviousPage,
			onNextPage: this.onNextPage,
		};

		return React.createElement(GroupDetailList, props);
	}

	public getOutputs(): IOutputs {
		return {};
	}

	public destroy(): void {
		this.isDisposed = true;
	}

	/**
	 * The column the rows on screen are actually chunked by.
	 *
	 * Grouping only produces real groups once the rows have come back sorted by that column.
	 * Between picking a group column and the refresh landing, the dataset already carries the new
	 * sort while the rows are still the old ones — grouping those would cut the page into one
	 * group per run of equal values.
	 */
	private groupedBy(): string | undefined {
		if (!this.groupColumnKey || sortDirectionOf(this.appliedSorting, this.groupColumnKey) === undefined) {
			return undefined;
		}
		return this.groupColumnKey;
	}

	/**
	 * A view change can reset the sorting while keeping the column, which would leave the picker
	 * claiming a grouping that is not on screen and no way to get it back. The sort is asked for
	 * again — once, because a view that will not sort by that column must not send the control
	 * into a refresh loop. It gives up by dropping the grouping, which the picker follows.
	 */
	private keepGroupColumnSorted(dataset: DataSet): void {
		if (!this.groupColumnKey) {
			this.groupSortRequested = false;
			return;
		}

		if (sortDirectionOf(dataset.sorting, this.groupColumnKey) !== undefined) {
			this.groupSortRequested = false;
		} else if (this.groupSortRequested) {
			this.groupColumnKey = undefined;
			this.groupSortRequested = false;
		} else {
			this.groupSortRequested = true;
			this.onSort(this.groupColumnKey);
		}
	}

	/**
	 * Refreshing clears the dataset's selection, and every sort and page turn goes through a
	 * refresh. What the user picked is put back so the command bar keeps seeing it.
	 */
	private reapplySelection(dataset: DataSet): void {
		if (!this.mustReapplySelection) {
			return;
		}
		this.mustReapplySelection = false;

		const onPage = new Set(this.rows.map((row) => row.id));
		const kept = this.selection.filter((id) => onPage.has(id));
		if (kept.length > 0) {
			dataset.setSelectedRecordIds?.(kept);
		}
	}

	/**
	 * The view decides how many records a page holds. Applying it once per change keeps the
	 * component from asking the server for the whole table, which is what the previous version
	 * did with a page size of 5000 and a loop over every page.
	 */
	private applyPageSize(dataset: DataSet): void {
		const configured = this.context.parameters.pageSize.raw;
		const pageSize = configured && configured > 0 ? configured : DEFAULT_PAGE_SIZE;
		if (pageSize === this.appliedPageSize || dataset.loading || !dataset.paging) {
			return;
		}

		this.appliedPageSize = pageSize;
		if (dataset.paging.pageSize !== pageSize) {
			dataset.paging.setPageSize(pageSize);
			this.mustReapplySelection = true;
			dataset.refresh();
		}
	}

	private get dataset(): DataSet {
		return this.context.parameters.listDataSet;
	}

	private readonly formatNumber = (value: number): string => this.context.formatting.formatInteger(value);

	private readonly sortOf = (columnKey: string): SortDirection | undefined =>
		sortDirectionOf(this.dataset.sorting, columnKey);

	private readonly onSort = (columnKey: string): void => {
		if (this.isDisposed) {
			return;
		}
		const dataset = this.dataset;
		const sorting = nextSorting(dataset.sorting, columnKey, this.groupColumnKey);
		if (Array.isArray(dataset.sorting)) {
			// The framework watches the array it handed out, so it is replaced in place.
			dataset.sorting.length = 0;
			dataset.sorting.push(...sorting);
		} else {
			dataset.sorting = sorting;
		}
		this.mustReapplySelection = true;
		dataset.refresh();
	};

	/**
	 * Grouping chunks consecutive rows, so the dataset has to be sorted by the group column.
	 * Sorting server-side also keeps groups intact across pages.
	 */
	private readonly onGroupColumnChange = (columnKey: string | undefined): void => {
		if (this.isDisposed) {
			return;
		}
		this.groupColumnKey = columnKey;
		this.groupSortRequested = false;
		if (columnKey && sortDirectionOf(this.dataset.sorting, columnKey) === undefined) {
			this.groupSortRequested = true;
			this.onSort(columnKey);
		}
	};

	/** The component decides what is selected; the dataset is told so commands see the same set. */
	private readonly onSelectionChange = (rowIds: string[]): void => {
		this.selection = rowIds;
		if (!this.isDisposed) {
			this.dataset.setSelectedRecordIds?.(rowIds);
		}
	};

	private readonly onOpenRecord = (rowId: string): void => {
		const record = this.dataset.records?.[rowId];
		if (record) {
			this.dataset.openDatasetItem(record.getNamedReference());
		}
	};

	/**
	 * A lookup cell points at the record it references, not at the row it sits in.
	 */
	private readonly onOpenReference = (rowId: string, columnKey: string): void => {
		const record = this.dataset.records?.[rowId];
		if (!record) {
			return;
		}

		const value = record.getValue(columnKey);
		const reference = Array.isArray(value) ? value[0] : value;
		if (reference && typeof reference === "object" && "id" in reference) {
			this.dataset.openDatasetItem(reference as EntityReference);
		}
	};

	// Both take loadOnlyNewPage: without it the framework returns the whole range it has loaded
	// so far, so the grid would accumulate every page instead of turning to the next one.
	private readonly onPreviousPage = (): void => {
		this.mustReapplySelection = true;
		this.dataset.paging?.loadPreviousPage(true);
	};

	private readonly onNextPage = (): void => {
		this.mustReapplySelection = true;
		this.dataset.paging?.loadNextPage(true);
	};

	private resource(key: string): string {
		return this.context.resources.getString(key);
	}

	private getStrings(): GroupDetailListStrings {
		return {
			groupBy: this.resource("Grid_GroupBy"),
			noGrouping: this.resource("Grid_NoGrouping"),
			loading: this.resource("Grid_Loading"),
			noRecords: this.resource("Grid_NoRecords"),
			previousPage: this.resource("Grid_PreviousPage"),
			nextPage: this.resource("Grid_NextPage"),
			selectAll: this.resource("Grid_SelectAll"),
			selectRow: this.resource("Grid_SelectRow"),
			emptyGroup: this.resource("Grid_EmptyGroup"),
			selectionCount: (count: string) => interpolate(this.resource("Grid_SelectionCount"), count),
			recordCount: (loaded: string, total: string) =>
				interpolate(this.resource("Grid_RecordCount"), loaded, total),
			loadedCount: (loaded: string) => interpolate(this.resource("Grid_LoadedCount"), loaded),
		};
	}
}

// Re-exported so the grouping rule can be exercised without a platform context.
export { groupRows, currentPageNumber };
