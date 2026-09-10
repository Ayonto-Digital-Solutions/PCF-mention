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
 * whitespace or an opening bracket. User names contain a space, so the query may hold one too —
 * but not more, and not a trailing one. Without that bound the query would keep swallowing the
 * rest of the sentence and every further keystroke would trigger another lookup. The query also
 * never crosses a line break and never grows past MAX_QUERY_LENGTH.
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

			const query = text.slice(i + 1, caret);
			if (query.endsWith(" ") || query.split(" ").length > 2) {
				return null;
			}

			return { start: i, end: caret, query };
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
 *
 * The caret always ends up behind the single space that follows the name — behind the one this
 * writes, or behind the one that was already there. Leaving it in front of an existing space
 * would put the next keystroke inside the name and break the mention.
 */
export function applyMention(text: string, trigger: MentionTrigger, displayName: string): MentionInsertResult {
	const mention = `@${displayName.trim()}`;
	const tail = text.slice(trigger.end);
	const reusesExistingSpace = tail.startsWith(" ");
	const head = `${text.slice(0, trigger.start)}${mention}${reusesExistingSpace ? "" : " "}`;

	return { text: `${head}${tail}`, caret: head.length + (reusesExistingSpace ? 1 : 0) };
}

/**
 * Characters that end a mention. Anything else — a letter, a digit, a hyphen — continues the
 * name, so "@Anna Meier-Schulz" does not count as a mention of "Anna Meier".
 */
const MENTION_END = /[\s,.;:!?()[\]{}"]/;

/**
 * True when the text still carries the mention for the given display name.
 *
 * A plain substring test would report one name as mentioned whenever a longer name starting with
 * it is in the text, and this predicate decides whether a pending notification still applies —
 * so it would mail someone who was never mentioned and stay quiet for someone who was.
 *
 * Names hold spaces, so a space has to end a mention. "@Tom Braun (Fabrikam)" therefore still
 * counts as a mention of "Tom Braun"; plain text cannot tell those two apart.
 */
export function containsMention(text: string, displayName: string): boolean {
	const name = displayName.trim();
	if (name.length === 0) {
		return false;
	}

	const mention = `@${name}`;
	for (let at = text.indexOf(mention); at !== -1; at = text.indexOf(mention, at + 1)) {
		const following = text[at + mention.length];
		if (following === undefined || MENTION_END.test(following)) {
			return true;
		}
	}

	return false;
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
