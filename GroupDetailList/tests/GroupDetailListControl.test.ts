import { describe, expect, it, vi } from "vitest";
import { GroupDetailListControl } from "../GroupDetailListControl/index";
import type { IInputs } from "../GroupDetailListControl/generated/ManifestTypes";
import type { GroupDetailListProps } from "../GroupDetailListControl/components/GroupDetailList";

type SortStatus = ComponentFramework.PropertyHelper.DataSetApi.SortStatus;

/**
 * The control class is what the platform drives, so the rules that depend on the dataset's own
 * state — what the rows on screen are sorted by, and what to do when a view change resets it —
 * are exercised here rather than through the component.
 */
function makeColumn(name: string, order: number) {
	return {
		name,
		displayName: name,
		dataType: "SingleLine.Text",
		order,
		visualSizeFactor: 100,
		isHidden: false,
		isPrimary: order === 0,
		disableSorting: false,
	};
}

function makeDataset(sorting: SortStatus[]) {
	const columns = [makeColumn("name", 0), makeColumn("city", 1)];
	const records = {
		"1": { getFormattedValue: (key: string) => (key === "city" ? "Berlin" : "Anna"), getNamedReference: vi.fn() },
		"2": { getFormattedValue: (key: string) => (key === "city" ? "Berlin" : "Bert"), getNamedReference: vi.fn() },
	};

	return {
		columns,
		records,
		sortedRecordIds: ["1", "2"],
		sorting,
		loading: false,
		error: false,
		errorMessage: "",
		paging: {
			pageSize: 50,
			hasNextPage: false,
			hasPreviousPage: false,
			totalResultCount: 2,
			setPageSize: vi.fn(),
			loadNextPage: vi.fn(),
			loadPreviousPage: vi.fn(),
		},
		refresh: vi.fn(),
		getSelectedRecordIds: () => [] as string[],
		setSelectedRecordIds: vi.fn(),
		openDatasetItem: vi.fn(),
	};
}

function makeContext(dataset: ReturnType<typeof makeDataset>) {
	return {
		parameters: {
			listDataSet: dataset,
			enableGrouping: { raw: "0" },
			pageSize: { raw: 50 },
		},
		formatting: { formatInteger: (value: number) => String(value) },
		resources: { getString: (key: string) => key },
	} as unknown as ComponentFramework.Context<IInputs>;
}

function mount(sorting: SortStatus[] = []) {
	const dataset = makeDataset(sorting);
	const context = makeContext(dataset);
	const control = new GroupDetailListControl();
	control.init(context);

	const update = () => control.updateView(context).props as GroupDetailListProps;
	return { control, dataset, update, props: update() };
}

describe("GroupDetailListControl grouping", () => {
	it("only reports a grouping once the rows came back sorted by that column", () => {
		const { dataset, update, props } = mount();
		expect(props.isGroupedBy("city")).toBe(false);

		props.onGroupColumnChange("city");

		// The sort was requested, so the dataset already carries it — but the rows on screen are
		// still the ones from before, and chunking those would invent groups.
		expect(dataset.refresh).toHaveBeenCalledTimes(1);
		dataset.loading = true;
		expect(update().isGroupedBy("city")).toBe(false);

		// The refresh lands: the rows now come back in that order.
		dataset.loading = false;
		dataset.sortedRecordIds = ["2", "1"];
		expect(update().isGroupedBy("city")).toBe(true);
	});

	it("asks once for a sort a view change dropped, then stops claiming the grouping", () => {
		const { dataset, update } = mount([{ name: "city", sortDirection: 0 }]);
		const props = update();
		props.onGroupColumnChange("city");
		expect(dataset.refresh).not.toHaveBeenCalled();
		expect(update().isGroupedBy("city")).toBe(true);

		// A view change resets the sorting while keeping the column.
		dataset.sorting.length = 0;
		expect(update().groupColumnKey).toBe("city");
		expect(dataset.refresh).toHaveBeenCalledTimes(1);
		expect(dataset.sorting).toEqual([{ name: "city", sortDirection: 0 }]);

		// The view will not have it: the grouping is dropped rather than asked for again.
		dataset.sorting.length = 0;
		const after = update();
		expect(after.groupColumnKey).toBeUndefined();
		expect(after.isGroupedBy("city")).toBe(false);
		expect(dataset.refresh).toHaveBeenCalledTimes(1);
	});

	it("does not group while the view sorts by another column first", () => {
		// Grouping chunks consecutive rows, so the group column has to be the leading sort —
		// second place scatters one value over run after run.
		const { dataset, update } = mount([
			{ name: "name", sortDirection: 0 },
			{ name: "city", sortDirection: 0 },
		]);
		const props = update();
		expect(props.isGroupedBy("city")).toBe(false);

		props.onGroupColumnChange("city");

		expect(dataset.refresh).toHaveBeenCalledTimes(1);
		expect(dataset.sorting).toEqual([
			{ name: "city", sortDirection: 0 },
			{ name: "name", sortDirection: 0 },
		]);
		expect(update().isGroupedBy("city")).toBe(true);
	});

	it("restores the selection after the sort it asked for itself", () => {
		const { dataset, update } = mount([{ name: "city", sortDirection: 0 }]);
		const props = update();
		props.onGroupColumnChange("city");
		props.onSelectionChange(["1"]);

		// A view change resets the sorting; the next update asks for it again.
		dataset.sorting.length = 0;
		update();
		expect(dataset.refresh).toHaveBeenCalledTimes(1);
		dataset.setSelectedRecordIds.mockClear();

		// The refresh lands, and a refresh clears the dataset's own selection.
		update();

		expect(dataset.setSelectedRecordIds).toHaveBeenCalledWith(["1"]);
	});

	it("drops a group column the new view no longer has", () => {
		const { dataset, update } = mount([{ name: "city", sortDirection: 0 }]);
		update().onGroupColumnChange("city");
		expect(update().groupColumnKey).toBe("city");

		dataset.columns = [makeColumn("name", 0)];
		expect(update().groupColumnKey).toBeUndefined();
		expect(dataset.refresh).not.toHaveBeenCalled();
	});
});
