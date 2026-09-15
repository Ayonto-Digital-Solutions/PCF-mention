/**
 * How tall the editor has to be at minimum — the height the form gives the field, and what to
 * fall back on when it gives none.
 *
 * The height a maker sets in the form designer lives in the `rowspan` attribute of the cell, and
 * no code component API reads it: `context.mode.allocatedHeight` is `-1` in a model-driven app,
 * with or without `trackContainerResize`. What is left is measuring the box the host put the
 * component in — which is why the rules here are about telling an outside change apart from the
 * component's own growth. Get that wrong and the two push each other up forever.
 *
 * Free of the DOM below `watchHostHeight`, so the rules can be exercised on their own.
 */

/**
 * A height change smaller than this is not the form talking.
 *
 * Zoom, a device pixel ratio that is not a whole number and a scrollbar appearing all move a box
 * by a fraction of a pixel or one whole one. Following those means re-rendering on every zoom
 * step for nothing.
 */
export const HYSTERESIS_PX = 2;

/** A form with no room for even one line is a mistake, and thirty rows is already a page. */
export const MIN_ROWS = 1;
export const MAX_ROWS = 30;
/** What the property ships with, and what an unreadable value falls back to. */
export const DEFAULT_ROWS = 3;

/**
 * Brings the configured row count into a range that cannot break a form.
 *
 * A maker types into a plain number field, so 0 and 500 are both a keystroke away, and the
 * platform hands over `null` for an empty one.
 */
export function clampRows(raw: number | null | undefined): number {
	if (typeof raw !== "number" || !Number.isFinite(raw)) {
		return DEFAULT_ROWS;
	}
	return Math.min(Math.max(Math.round(raw), MIN_ROWS), MAX_ROWS);
}

/** One look at the two boxes that matter, in pixels. */
export interface Measurement {
	/** The box the host put the component in. */
	readonly host: number;
	/** What the component itself takes up inside it. */
	readonly own: number;
}

/**
 * What the form is taken to be asking for, and the component's own height when that was last
 * decided. The second number is what makes the first one trustworthy: without it, the component
 * growing and the form growing look exactly alike.
 */
export interface GivenHeight {
	/** The height attributed to the form. Zero means the form gives none. */
	readonly fromForm: number;
	/** How tall the component was at the reading this was decided from. */
	readonly ownAtReading: number;
}

/**
 * The first reading, from nothing.
 *
 * A code component cannot measure its box before it has rendered into it — the React element goes
 * back to the platform, which mounts it, and by then the editor is already there taking up room.
 * So the first reading cannot ask "is this box bigger than zero"; it asks whether the box has
 * **slack**: room left over beyond what the component is using. A box that merely hugs the
 * component says nothing about what the form wants, and the row count decides instead.
 *
 * How much slack counts is the caller's to say, and it matters more than it looks. A host box
 * with nothing but a few pixels of padding has slack too — take that for a form height and the
 * minimum ends up pinned to whatever the column happened to contain when the form opened, which
 * is a field that can never be made smaller again. One full row is the bar.
 */
function firstReading(reading: Measurement, slack: number): GivenHeight {
	const hasSlack = reading.host - reading.own > Math.max(slack, HYSTERESIS_PX);
	return {
		fromForm: hasSlack ? reading.host : 0,
		ownAtReading: reading.own,
	};
}

/**
 * Folds one reading into what is known, and refuses to follow the component's own growth.
 *
 * Where the box grew by as much as the component did, the component is what grew it — the form
 * still wants what it wanted. Only a change the component cannot account for is the form's, and
 * only then does the minimum move.
 */
export function nextGiven(
	previous: GivenHeight | null,
	reading: Measurement,
	slack = HYSTERESIS_PX,
): GivenHeight {
	if (previous === null) {
		return firstReading(reading, slack);
	}

	const change = reading.host - previous.fromForm;
	if (Math.abs(change) < HYSTERESIS_PX) {
		return previous;
	}

	const ownChange = reading.own - previous.ownAtReading;
	if (Math.abs(change - ownChange) < HYSTERESIS_PX) {
		// Grown by our own doing. The form's ask is unchanged; only the yardstick moves, so the
		// next reading is compared against where the component stands now.
		return { fromForm: previous.fromForm, ownAtReading: reading.own };
	}

	return { fromForm: reading.host, ownAtReading: reading.own };
}

/**
 * The minimum height to put on the box, in pixels: what the form asks for, or the row count when
 * that is more — or all there is.
 *
 * The row count is turned into pixels here rather than written into the stylesheet as a number,
 * because a line is not a fixed height: it moves with the theme and with the browser's zoom. The
 * caller reads the line height off the live element and asks again.
 */
export function minHeight(
	fromForm: number,
	rows: number,
	lineHeight: number,
	chrome = 0,
): number {
	const forRows = rows * lineHeight + chrome;
	return Math.max(fromForm, forRows);
}

/** What one row costs on a given element, in pixels. */
export interface RowMetrics {
	/** The height of one line of text. */
	readonly lineHeight: number;
	/** Padding and border, where the box counts them towards its own height. */
	readonly chrome: number;
}

/**
 * Reads off a live element what a row is worth right now.
 *
 * Right now, because it is not a constant: the theme sets the type scale and the browser's zoom
 * multiplies it. Asking the element each time is what keeps the row count honest across both.
 *
 * Returns null where the line height is not a number — `normal` leaves it to the font, and no
 * sensible pixel count can be invented for it. The stylesheet carries its own fallback for that.
 */
export function readRowMetrics(element: HTMLElement): RowMetrics | null {
	const style = getComputedStyle(element);
	const lineHeight = Number.parseFloat(style.lineHeight);
	if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
		return null;
	}

	// min-height is measured against the border box or the content box, depending on box-sizing.
	// Counting padding and border into the wrong one is off by roughly one row.
	const pixels = (value: string): number => {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	};
	const chrome =
		style.boxSizing === "border-box"
			? pixels(style.paddingTop) +
				pixels(style.paddingBottom) +
				pixels(style.borderTopWidth) +
				pixels(style.borderBottomWidth)
			: 0;

	return { lineHeight, chrome };
}

/** A running measurement of the host's box; `stop` takes it down again. */
export interface HostHeightWatch {
	stop(): void;
}

/**
 * Watches the box the host gave the component and reports what the form asks for.
 *
 * Measured is the component's parent — the element the platform mounted the component into.
 * Observed is that element's own parent, because the component growing changes its own box and
 * would otherwise keep waking this up. That is a matter of noise, not of correctness: what keeps
 * the minimum from chasing the component is `nextGiven`, which would hold either way.
 *
 * `slack` says how much room beyond the component's own height still counts as the form talking
 * rather than the host's padding. It is asked each time, because a row is not always worth the
 * same number of pixels.
 */
export function watchHostHeight(
	root: HTMLElement,
	report: (fromForm: number) => void,
	slack: () => number,
): HostHeightWatch {
	const host = root.parentElement ?? root;
	let given: GivenHeight | null = null;

	const read = (): void => {
		const next = nextGiven(
			given,
			{
				host: host.getBoundingClientRect().height,
				own: root.getBoundingClientRect().height,
			},
			slack(),
		);
		const changed = given === null || next.fromForm !== given.fromForm;
		given = next;
		if (changed) {
			report(next.fromForm);
		}
	};

	read();

	if (typeof ResizeObserver === "undefined") {
		// No observer to be had — a test environment, or a browser old enough that the form it
		// is showing has other problems. The first reading stands.
		return { stop: () => undefined };
	}

	const observer = new ResizeObserver(read);
	observer.observe(host.parentElement ?? host);
	return { stop: () => observer.disconnect() };
}
