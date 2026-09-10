import * as React from "react";
import {
	Link,
	Table,
	TableBody,
	TableCell,
	TableCellLayout,
	TableHeader,
	TableHeaderCell,
	TableRow,
	TableSelectionCell,
	makeStyles,
	shorthands,
	tokens,
} from "@fluentui/react-components";
import type { GridColumn, GridRow, RowGroup, SortDirection } from "../utils/dataset";

export interface RecordTableStrings {
	readonly selectAll: string;
	readonly selectRow: string;
	readonly emptyGroup: string;
}

export interface RecordTableProps {
	readonly columns: readonly GridColumn[];
	readonly rows: readonly GridRow[];
	readonly groups?: readonly RowGroup[];
	readonly selected: ReadonlySet<string>;
	readonly sortOf: (columnKey: string) => SortDirection | undefined;
	readonly strings: RecordTableStrings;
	readonly onToggleRow: (rowId: string) => void;
	readonly onToggleAll: () => void;
	readonly onSort: (columnKey: string) => void;
	readonly onOpenRecord: (rowId: string) => void;
	readonly onOpenReference: (rowId: string, columnKey: string) => void;
}

const useStyles = makeStyles({
	table: {
		minWidth: "100%",
	},
	groupHeader: {
		backgroundColor: tokens.colorNeutralBackground3,
		fontWeight: tokens.fontWeightSemibold,
	},
	groupCount: {
		color: tokens.colorNeutralForeground3,
		fontWeight: tokens.fontWeightRegular,
		marginInlineStart: tokens.spacingHorizontalXS,
	},
	headerCell: {
		...shorthands.overflow("hidden"),
		whiteSpace: "nowrap",
	},
	cell: {
		...shorthands.overflow("hidden"),
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
});

export const RecordTable: React.FC<RecordTableProps> = (props) => {
	const styles = useStyles();
	const { columns, rows, groups, selected, strings } = props;

	const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
	const someSelected = !allSelected && rows.some((row) => selected.has(row.id));

	const renderCell = (row: GridRow, column: GridColumn) => {
		const value = row.values[column.key] ?? "";
		if (value.length === 0) {
			return null;
		}

		switch (column.kind) {
			case "record":
				return (
					<Link
						onClick={() => {
							props.onOpenRecord(row.id);
						}}
					>
						{value}
					</Link>
				);
			case "reference":
				return (
					<Link
						onClick={() => {
							props.onOpenReference(row.id, column.key);
						}}
					>
						{value}
					</Link>
				);
			case "email":
				return <Link href={`mailto:${encodeURIComponent(value)}`}>{value}</Link>;
			case "phone":
				return <Link href={`tel:${value.replace(/[^+\d]/g, "")}`}>{value}</Link>;
			default:
				return value;
		}
	};

	const renderRow = (row: GridRow) => (
		<TableRow
			appearance={selected.has(row.id) ? "brand" : "none"}
			key={row.id}
			onDoubleClick={() => {
				props.onOpenRecord(row.id);
			}}
		>
			<TableSelectionCell
				aria-label={strings.selectRow}
				checked={selected.has(row.id)}
				checkboxIndicator={{ "aria-label": strings.selectRow }}
				onClick={() => {
					props.onToggleRow(row.id);
				}}
			/>
			{columns.map((column) => (
				<TableCell className={styles.cell} key={column.key}>
					<TableCellLayout truncate>{renderCell(row, column)}</TableCellLayout>
				</TableCell>
			))}
		</TableRow>
	);

	const renderGroupHeader = (group: RowGroup) => (
		<TableRow className={styles.groupHeader} key={`${group.key}:header`}>
			<TableCell colSpan={columns.length + 1}>
				<TableCellLayout truncate>
					{group.label ?? strings.emptyGroup}
					<span className={styles.groupCount}>({group.rows.length})</span>
				</TableCellLayout>
			</TableCell>
		</TableRow>
	);

	return (
		<Table className={styles.table} size="small" sortable>
			<TableHeader>
				<TableRow>
					<TableSelectionCell
						aria-label={strings.selectAll}
						checked={allSelected ? true : someSelected ? "mixed" : false}
						checkboxIndicator={{ "aria-label": strings.selectAll }}
						onClick={props.onToggleAll}
					/>
					{columns.map((column) => {
						const direction = props.sortOf(column.key);
						return (
							<TableHeaderCell
								aria-sort={direction ?? "none"}
								className={styles.headerCell}
								key={column.key}
								onClick={
									column.sortable
										? () => {
												props.onSort(column.key);
											}
										: undefined
								}
								sortDirection={direction}
								style={{ width: `${column.widthFactor.toString()}px` }}
							>
								{column.label}
							</TableHeaderCell>
						);
					})}
				</TableRow>
			</TableHeader>
			<TableBody>
				{groups
					? groups.flatMap((group) => [renderGroupHeader(group), ...group.rows.map(renderRow)])
					: rows.map(renderRow)}
			</TableBody>
		</Table>
	);
};
