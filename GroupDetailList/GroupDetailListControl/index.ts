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
	private appliedPageSize = 0;
	private isDisposed = false;

	public init(context: ComponentFramework.Context<IInputs>): void {
		this.context = context;
		context.mode.trackContainerResize(true);
	}

	public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
		this.context = context;
		const dataset = context.parameters.listDataSet;

		this.applyPageSize(dataset);

		if (!dataset.loading) {
			this.columns = toGridColumns(dataset.columns);
			this.rows = toGridRows(dataset.sortedRecordIds, dataset.records, this.columns);
			this.initialSelectedIds = dataset.getSelectedRecordIds?.() ?? [];
		}

		const props: GroupDetailListProps = {
			columns: this.columns,
			rows: this.rows,
			initialSelectedIds: this.initialSelectedIds,
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
		const sorting = nextSorting(dataset.sorting, columnKey);
		if (Array.isArray(dataset.sorting)) {
			// The framework watches the array it handed out, so it is replaced in place.
			dataset.sorting.length = 0;
			dataset.sorting.push(...sorting);
		} else {
			dataset.sorting = sorting;
		}
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
		if (columnKey && sortDirectionOf(this.dataset.sorting, columnKey) === undefined) {
			this.onSort(columnKey);
		}
	};

	/** The component decides what is selected; the dataset is told so commands see the same set. */
	private readonly onSelectionChange = (rowIds: string[]): void => {
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

	private readonly onPreviousPage = (): void => {
		this.dataset.paging?.loadPreviousPage();
	};

	private readonly onNextPage = (): void => {
		this.dataset.paging?.loadNextPage();
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
