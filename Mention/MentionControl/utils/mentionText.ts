/**
 * Pure helpers for turning raw text plus a caret position into an "@" mention trigger,
 * and for writing a picked mention back into the text.
 *
 * Everything here is free of DOM and platform dependencies so it can be reasoned about
 * (and unit tested) on its own.
 */

/** Characters that may precede an "@" for it to start a mention. */
const MENTION_BOUNDARY = /[\s([{>]/;

/** A mention query never spans more characters than this. */
export const MAX_QUERY_LENGTH = 40;

export interface MentionTrigger {
	/** Index of the "@" that opened the mention. */
	readonly start: number;
	/** Index just past the last character belonging to the query. */
	readonly end: number;
	/** The text typed after the "@", without the "@" itself. */
	readonly query: string;
}

/**
 * Finds the mention the caret currently sits in, or null when the caret is not inside one.
 *
 * A mention starts at an "@" that is either at the beginning of the text or preceded by
 * whitespace or an opening bracket. Because user names contain spaces, the query may contain
 * spaces as well, but it never crosses a line break and never grows past MAX_QUERY_LENGTH.
 */
export function findMentionTrigger(text: string, caret: number): MentionTrigger | null {
	if (caret < 0 || caret > text.length) {
		return null;
	}

	const lowerBound = Math.max(0, caret - (MAX_QUERY_LENGTH + 1));
	for (let i = caret - 1; i >= lowerBound; i--) {
		const character = text[i];

		if (character === "\n" || character === "\r") {
			return null;
		}

		if (character === "@") {
			const previous = i > 0 ? text[i - 1] : undefined;
			if (previous !== undefined && !MENTION_BOUNDARY.test(previous)) {
				return null;
			}
			return { start: i, end: caret, query: text.slice(i + 1, caret) };
		}
	}

	return null;
}

export interface MentionInsertResult {
	readonly text: string;
	readonly caret: number;
}

/**
 * Replaces the triggering "@query" with "@Display Name " and reports where the caret
 * has to be placed afterwards.
 */
export function applyMention(text: string, trigger: MentionTrigger, displayName: string): MentionInsertResult {
	const mention = `@${displayName.trim()}`;
	const tail = text.slice(trigger.end);
	const separator = tail.startsWith(" ") ? "" : " ";
	const head = `${text.slice(0, trigger.start)}${mention}${separator}`;

	return { text: `${head}${tail}`, caret: head.length };
}

/** Escapes a value so it can be embedded in an OData string literal. */
export function escapeODataLiteral(value: string): string {
	return value.replace(/'/g, "''");
}

/** Escapes a value so it can be embedded in the HTML body of an e-mail. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Dataverse returns record ids both bare and wrapped in braces. */
export function normalizeGuid(value: string | null | undefined): string {
	return (value ?? "").replace(/[{}]/g, "").trim();
}

/**
 * Builds the deep link to a record in a model-driven app.
 * Returns undefined when the environment URL was not configured on the component.
 */
export function buildRecordUrl(options: {
	orgUrl?: string | null;
	entityName?: string | null;
	entityId?: string | null;
	appId?: string | null;
}): string | undefined {
	const orgUrl = (options.orgUrl ?? "").trim().replace(/\/+$/, "");
	const entityName = (options.entityName ?? "").trim();
	const entityId = normalizeGuid(options.entityId);

	if (orgUrl.length === 0 || entityName.length === 0 || entityId.length === 0) {
		return undefined;
	}

	const parameters = [`pagetype=entityrecord`, `etn=${encodeURIComponent(entityName)}`, `id=${encodeURIComponent(entityId)}`];
	const appId = normalizeGuid(options.appId);
	if (appId.length > 0) {
		parameters.unshift(`appid=${encodeURIComponent(appId)}`);
	}

	return `${orgUrl}/main.aspx?${parameters.join("&")}`;
}
