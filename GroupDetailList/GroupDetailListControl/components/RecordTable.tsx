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

/**
 * A phone column is free text, so it routinely holds an extension or a second number.
 * Stripping everything but digits would glue those onto the subscriber number and dial something
 * else, so anything that is not one plain number is left as text.
 */
function toDialableNumber(value: string): string | undefined {
	// Brackets around digits mean opposite things once a country code is in front: the German
	// trunk "0" of "+49 (0)30 …" must be left out when dialling, an American area code must not.
	// Nothing in the text says which, so such a number stays text; a national "(030) …" is
	// unambiguous and keeps its digits.
	if (value.trimStart().startsWith("+") && /\(\s*\d/.test(value)) {
		return undefined;
	}

	const withoutSeparators = value.replace(/[\s\-.()/]/g, "");
	return /^\+?\d{3,20}$/.test(withoutSeparators) ? withoutSeparators : undefined;
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

		// The row opens the record on a double click and these cells open something on a single
		// click, so one gesture would otherwise reach both. The cell keeps its events to itself,
		// and ignores the second click of a double click.
		const openFromCell = (open: () => void) => ({
			onClick: (event: React.MouseEvent) => {
				event.stopPropagation();
				if (event.detail <= 1) {
					open();
				}
			},
			onDoubleClick: (event: React.MouseEvent) => {
				event.stopPropagation();
			},
		});

		switch (column.kind) {
			case "record":
				return (
					<Link
						{...openFromCell(() => {
							props.onOpenRecord(row.id);
						})}
					>
						{value}
					</Link>
				);
			case "reference":
				return (
					<Link
						{...openFromCell(() => {
							props.onOpenReference(row.id, column.key);
						})}
					>
						{value}
					</Link>
				);
			case "email":
				// RFC 6068 keeps the "@" that separates local part from domain, so the address is
				// encoded without swallowing its own delimiter.
				return <Link href={`mailto:${encodeURI(value)}`}>{value}</Link>;
			case "phone": {
				const dialable = toDialableNumber(value);
				return dialable ? <Link href={`tel:${dialable}`}>{value}</Link> : value;
			}
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
				onClick={(event) => {
					event.stopPropagation();
					props.onToggleRow(row.id);
				}}
				onDoubleClick={(event) => {
					event.stopPropagation();
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
								// A column the view forbids sorting must not look sortable either.
								aria-sort={column.sortable ? (direction ?? "none") : undefined}
								className={styles.headerCell}
								key={column.key}
								onClick={
									column.sortable
										? () => {
												props.onSort(column.key);
											}
										: undefined
								}
								sortable={column.sortable}
								sortDirection={column.sortable ? direction : undefined}
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
