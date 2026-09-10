import * as React from "react";
import {
	Button,
	Caption1,
	Dropdown,
	FluentProvider,
	MessageBar,
	MessageBarBody,
	Option,
	Spinner,
	Toolbar,
	makeStyles,
	mergeClasses,
	shorthands,
	tokens,
	useId,
	webLightTheme,
	type Theme,
} from "@fluentui/react-components";
import { RecordTable, type RecordTableStrings } from "./RecordTable";
import { groupRows, type GridColumn, type GridRow, type SortDirection } from "../utils/dataset";

/** Value the group picker uses when nothing is grouped. */
export const NO_GROUPING = "__none__";

export interface GroupDetailListStrings extends RecordTableStrings {
	readonly groupBy: string;
	readonly noGrouping: string;
	readonly loading: string;
	readonly noRecords: string;
	readonly previousPage: string;
	readonly nextPage: string;
	readonly selectionCount: (count: string) => string;
	readonly recordCount: (loaded: string, total: string) => string;
	readonly loadedCount: (loaded: string) => string;
}

export interface GroupDetailListProps {
	readonly columns: readonly GridColumn[];
	readonly rows: readonly GridRow[];
	/** What the dataset already had selected when the component first rendered. */
	readonly initialSelectedIds: readonly string[];
	readonly groupingEnabled: boolean;
	readonly isLoading: boolean;
	readonly errorMessage?: string;
	readonly totalResultCount?: number;
	readonly hasPreviousPage: boolean;
	readonly hasNextPage: boolean;
	readonly theme?: Theme;
	readonly strings: GroupDetailListStrings;
	readonly formatNumber: (value: number) => string;
	readonly sortOf: (columnKey: string) => SortDirection | undefined;
	readonly onGroupColumnChange: (columnKey: string | undefined) => void;
	readonly onSelectionChange: (rowIds: string[]) => void;
	readonly onSort: (columnKey: string) => void;
	readonly onOpenRecord: (rowId: string) => void;
	readonly onOpenReference: (rowId: string, columnKey: string) => void;
	readonly onPreviousPage: () => void;
	readonly onNextPage: () => void;
}

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		rowGap: tokens.spacingVerticalXS,
	},
	toolbar: {
		columnGap: tokens.spacingHorizontalS,
		justifyContent: "flex-start",
	},
	scroll: {
		flexGrow: 1,
		minHeight: 0,
		overflowX: "auto",
		overflowY: "auto",
	},
	footer: {
		alignItems: "center",
		columnGap: tokens.spacingHorizontalS,
		display: "flex",
		...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke2),
		paddingBlock: tokens.spacingVerticalXS,
	},
	spacer: {
		marginInlineStart: "auto",
	},
	muted: {
		color: tokens.colorNeutralForeground3,
	},
	empty: {
		color: tokens.colorNeutralForeground3,
		paddingBlock: tokens.spacingVerticalXXL,
		textAlign: "center",
	},
});

export const GroupDetailList: React.FC<GroupDetailListProps> = (props) => {
	const styles = useStyles();
	const { columns, rows, strings, onSelectionChange, onGroupColumnChange } = props;

	// Selection and grouping are what the user is doing right now, so they live here rather than
	// in the control class: a click then repaints straight away instead of waiting for the host
	// to call updateView again.
	const [selected, setSelected] = React.useState<ReadonlySet<string>>(
		() => new Set(props.initialSelectedIds)
	);
	const [groupColumnKey, setGroupColumnKey] = React.useState<string | undefined>(undefined);
	// Two of these controls can sit on one form, so the label id has to be unique per instance.
	const groupByLabelId = useId("group-by-label");

	const rowsKey = rows.map((row) => row.id).join("\u0000");
	const reportedFor = React.useRef<string | undefined>(undefined);
	const selectionSeeded = React.useRef(props.initialSelectedIds.length > 0);

	// The first updateView usually arrives while the dataset is still loading, so what the
	// platform already had selected only shows up on a later one.
	React.useEffect(() => {
		if (selectionSeeded.current || props.initialSelectedIds.length === 0) {
			return;
		}
		selectionSeeded.current = true;
		setSelected(new Set(props.initialSelectedIds));
	}, [props.initialSelectedIds]);

	// Two things happen when a new set of rows arrives. Records that left the page cannot stay
	// selected, or the header checkbox and the count would describe rows nobody can see. And a
	// refresh — which every sort and page turn goes through — clears the dataset's own selection,
	// so what survives has to be handed back to it or the command bar goes grey while the grid
	// still shows ticks.
	React.useEffect(() => {
		if (reportedFor.current === rowsKey) {
			return;
		}
		reportedFor.current = rowsKey;

		const onPage = new Set(rows.map((row) => row.id));
		const kept = [...selected].filter((id) => onPage.has(id));
		if (kept.length !== selected.size) {
			setSelected(new Set(kept));
		}
		onSelectionChange(kept);
	}, [rowsKey, rows, selected, onSelectionChange]);

	const commitSelection = React.useCallback(
		(next: ReadonlySet<string>) => {
			// From the first click on, the user's choice outranks whatever the dataset had.
			selectionSeeded.current = true;
			setSelected(next);
			onSelectionChange([...next]);
		},
		[onSelectionChange]
	);

	const toggleRow = React.useCallback(
		(rowId: string) => {
			const next = new Set(selected);
			if (!next.delete(rowId)) {
				next.add(rowId);
			}
			commitSelection(next);
		},
		[commitSelection, selected]
	);

	const toggleAll = React.useCallback(() => {
		const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
		commitSelection(allSelected ? new Set<string>() : new Set(rows.map((row) => row.id)));
	}, [commitSelection, rows, selected]);

	const changeGroupColumn = React.useCallback(
		(columnKey: string | undefined) => {
			setGroupColumnKey(columnKey);
			onGroupColumnChange(columnKey);
		},
		[onGroupColumnChange]
	);

	const groupColumn = columns.find((column) => column.key === groupColumnKey);
	// Chunking consecutive rows only produces real groups while the dataset is sorted by that
	// column, and the column can disappear when the view changes under the control.
	const activeGroupKey =
		groupColumn && props.sortOf(groupColumn.key) !== undefined ? groupColumn.key : undefined;

	const groups = React.useMemo(
		() => (props.groupingEnabled ? groupRows(rows, activeGroupKey) : undefined),
		[props.groupingEnabled, rows, activeGroupKey]
	);

	const selectedGroupLabel = groupColumn?.label ?? strings.noGrouping;

	const body = () => {
		if (props.isLoading && rows.length === 0) {
			return <Spinner label={strings.loading} labelPosition="below" />;
		}
		if (rows.length === 0) {
			return <Caption1 className={styles.empty}>{strings.noRecords}</Caption1>;
		}
		return (
			<RecordTable
				columns={columns}
				groups={groups}
				onOpenRecord={props.onOpenRecord}
				onOpenReference={props.onOpenReference}
				onSort={props.onSort}
				onToggleAll={toggleAll}
				onToggleRow={toggleRow}
				rows={rows}
				selected={selected}
				sortOf={props.sortOf}
				strings={strings}
			/>
		);
	};

	return (
		<FluentProvider theme={props.theme ?? webLightTheme}>
			<div className={styles.root}>
				{props.errorMessage ? (
					<MessageBar intent="error" politeness="polite">
						<MessageBarBody>{props.errorMessage}</MessageBarBody>
					</MessageBar>
				) : null}

				{props.groupingEnabled ? (
					<Toolbar className={styles.toolbar}>
						<Caption1 id={groupByLabelId}>{strings.groupBy}</Caption1>
						<Dropdown
							aria-labelledby={groupByLabelId}
							onOptionSelect={(_event, data) => {
								changeGroupColumn(data.optionValue === NO_GROUPING ? undefined : data.optionValue);
							}}
							selectedOptions={[groupColumn?.key ?? NO_GROUPING]}
							value={selectedGroupLabel}
						>
							<Option key={NO_GROUPING} value={NO_GROUPING}>
								{strings.noGrouping}
							</Option>
							{columns
								.filter((column) => column.sortable)
								.map((column) => (
									<Option key={column.key} value={column.key}>
										{column.label}
									</Option>
								))}
						</Dropdown>
						{props.isLoading && rows.length > 0 ? <Spinner size="tiny" /> : null}
					</Toolbar>
				) : null}

				<div className={styles.scroll}>{body()}</div>

				<div className={styles.footer}>
					<Caption1 className={styles.muted}>
						{strings.selectionCount(props.formatNumber(selected.size))}
					</Caption1>
					<Caption1 className={mergeClasses(styles.muted, styles.spacer)}>
						{props.totalResultCount === undefined
							? strings.loadedCount(props.formatNumber(rows.length))
							: strings.recordCount(
									props.formatNumber(rows.length),
									props.formatNumber(props.totalResultCount)
								)}
					</Caption1>
					<Button
						appearance="subtle"
						disabled={!props.hasPreviousPage}
						onClick={props.onPreviousPage}
						size="small"
					>
						{strings.previousPage}
					</Button>
					<Button appearance="subtle" disabled={!props.hasNextPage} onClick={props.onNextPage} size="small">
						{strings.nextPage}
					</Button>
				</div>
			</div>
		</FluentProvider>
	);
};
