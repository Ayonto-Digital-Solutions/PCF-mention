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

	// Records that left the loaded page cannot stay selected, or the header checkbox and the
	// count would describe rows nobody can see.
	React.useEffect(() => {
		const onPage = new Set(rows.map((row) => row.id));
		const kept = [...selected].filter((id) => onPage.has(id));
		if (kept.length !== selected.size) {
			setSelected(new Set(kept));
			onSelectionChange(kept);
		}
	}, [rows, selected, onSelectionChange]);

	const commitSelection = React.useCallback(
		(next: ReadonlySet<string>) => {
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

	const groups = React.useMemo(
		() => (props.groupingEnabled ? groupRows(rows, groupColumnKey) : undefined),
		[props.groupingEnabled, rows, groupColumnKey]
	);

	const selectedGroupLabel =
		columns.find((column) => column.key === groupColumnKey)?.label ?? strings.noGrouping;

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
						<Caption1 id="group-by-label">{strings.groupBy}</Caption1>
						<Dropdown
							aria-labelledby="group-by-label"
							onOptionSelect={(_event, data) => {
								changeGroupColumn(data.optionValue === NO_GROUPING ? undefined : data.optionValue);
							}}
							selectedOptions={[groupColumnKey ?? NO_GROUPING]}
							value={selectedGroupLabel}
						>
							<Option key={NO_GROUPING} value={NO_GROUPING}>
								{strings.noGrouping}
							</Option>
							{columns.map((column) => (
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
