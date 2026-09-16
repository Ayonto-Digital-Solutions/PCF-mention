/**
 * Which text column the component is bound to, and what follows from it.
 *
 * Dataverse knows exactly three text column types — Text, Text Area and Multiline Text — and the
 * manifest binds to all three through a type-group. The platform reports which one it actually is
 * on the bound parameter's `type`, spelled the way the manifest spells it.
 * https://learn.microsoft.com/power-apps/maker/data-platform/types-of-fields#text-columns
 * https://learn.microsoft.com/power-apps/developer/component-framework/manifest-schema-reference/type-group
 *
 * Rich text is none of those three. It is a **format** a maker sets on a text column, and it is
 * read and written by a control of its own, the rich text editor. Such a column stores HTML, and
 * this component reads and writes plain text — so the two do not belong on the same column. That
 * is documentation, not a check: what the column's format is cannot be read at runtime. The
 * metadata a bound property hands over is `DisplayName`, `LogicalName`, `RequiredLevel`,
 * `IsSecured`, `SourceType` and `Description`, and none of them says anything about a format.
 * https://learn.microsoft.com/power-apps/developer/component-framework/reference/metadata
 * https://learn.microsoft.com/power-apps/maker/model-driven-apps/rich-text-editor-control
 *
 * Free of the DOM and of the framework, so the rules can be exercised on their own.
 */

/** A single line of text — the type that gets a one-line field. */
export const SINGLE_LINE_TEXT = "SingleLine.Text";
/** A text area: several lines, up to 4,000 characters. */
export const SINGLE_LINE_TEXT_AREA = "SingleLine.TextArea";
/** Multiline text: several lines, up to 1,048,576 characters. */
export const MULTIPLE = "Multiple";

/** The three types the manifest's type-group binds to, in the order it lists them. */
export const SUPPORTED_COLUMN_TYPES: readonly string[] = [
	MULTIPLE,
	SINGLE_LINE_TEXT,
	SINGLE_LINE_TEXT_AREA,
];

/**
 * Whether the bound column holds a single line.
 *
 * Only the exact type counts. A type the platform reports that is none of the three is treated as
 * multi-line, because that is the shape the editor is built for — a component that cannot read the
 * type should not be the one to make the field smaller.
 *
 * In a canvas app a string type-group collapses to one type before the component ever sees it, so
 * this would read `SingleLine.Text` for every column. That costs nothing here: the component needs
 * `context.webAPI`, which canvas apps do not have, so it is model-driven only either way.
 */
export function isSingleLine(type: string | null | undefined): boolean {
	return type === SINGLE_LINE_TEXT;
}

/**
 * How many rows the field falls back to when the form gives it no height of its own.
 *
 * A single line of text column gets one row, and the configured row count has no say there: a
 * column that holds one line has no use for a field three lines tall. For the other two types the
 * configured value stands.
 */
export function fallbackRows(
	type: string | null | undefined,
	rows: number,
): number {
	return isSingleLine(type) ? 1 : rows;
}

/**
 * Turns every line break into a single space.
 *
 * Used for a single line of text column, where a pasted block of text would otherwise put line
 * breaks into a column whose own control can never show them again. One space per break, so the
 * caret stays where the typist left it.
 */
export function withoutLineBreaks(text: string): string {
	return text.replace(/\r\n|[\r\n]/g, " ");
}
