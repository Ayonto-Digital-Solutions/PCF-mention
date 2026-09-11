import { normalizeGuid } from "../utils/mentionText";
import type { UserSuggestion } from "./UserSearchService";

/**
 * The table the mention rows are written to. It ships with the solution, and a flow that
 * triggers on new rows is what turns a row into a mail, a Teams message, or anything else the
 * organisation sends notifications with.
 *
 * Dataverse itself is not asked to send: an environment whose mailboxes are not wired up would
 * leave drafts lying around, and most organisations route notifications through a flow anyway.
 */
export const DEFAULT_MENTION_TABLE = "ayonto_mention";

/** Value the row carries until a flow reports what became of it. */
const STATUS_NEW = "New";

/**
 * The ways a notification can go out. The row says which one it is for, so a mention that goes
 * out both ways writes two rows and each carries its own delivery status — one column cannot say
 * "the mail arrived but the chat message did not".
 */
export const CHANNELS = ["Email", "Teams"] as const;
export type MentionChannel = (typeof CHANNELS)[number];

/** Column lengths, so a long name or a long message is cut here rather than refused by Dataverse. */
const LIMITS = {
	name: 200,
	id: 64,
	channel: 32,
	linktext: 100,
	username: 200,
	useremail: 200,
	recordtable: 128,
	recordname: 400,
	recordurl: 500,
	subject: 200,
	message: 2000,
} as const;

export interface MentionRequest {
	readonly recipient: UserSuggestion;
	readonly senderUserId: string;
	/** Which way this one goes out. */
	readonly channel: MentionChannel;
	readonly subject: string;
	readonly message: string;
	/** What the link to the record is called in the notification. */
	readonly linkText?: string;
	readonly recordUrl?: string;
	readonly entityName?: string;
	readonly entityId?: string;
	/** What the record is called, so a notification can name it without looking it up. */
	readonly recordName?: string;
}

/** One mention that was written on this record, as the table remembers it. */
export interface LoggedMention {
	readonly name: string;
	readonly userId: string;
}

export class MentionLogError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MentionLogError";
	}
}

function clip(value: string, max: number): string {
	const trimmed = value.trim();
	return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Writes a mention into the table and reads back the ones a record already carries.
 *
 * The column names follow the table's own prefix, so pointing the component at a table of
 * another publisher needs nothing but that table's name — as long as its columns are named the
 * same way after the prefix.
 */
export class MentionLogService {
	private readonly webAPI: ComponentFramework.WebApi;
	private readonly table: string;
	private readonly prefix: string;

	constructor(webAPI: ComponentFramework.WebApi, table?: string) {
		this.webAPI = webAPI;
		this.table = (table ?? "").trim() || DEFAULT_MENTION_TABLE;
		const underscore = this.table.indexOf("_");
		this.prefix = underscore > 0 ? this.table.slice(0, underscore + 1) : "";
	}

	public async write(request: MentionRequest): Promise<void> {
		const recipient = normalizeGuid(request.recipient.id);
		if (recipient.length === 0) {
			throw new MentionLogError("A mention needs somebody to notify.");
		}

		await this.webAPI.createRecord(this.table, this.buildRow(request, recipient));
	}

	/**
	 * The mentions a record already carries, so names written earlier can be shown as links.
	 * A failure here is not worth a message: the text stays readable, only the links are missing.
	 */
	public async listFor(entityName: string, entityId: string): Promise<LoggedMention[]> {
		const recordId = normalizeGuid(entityId);
		const table = entityName.trim().toLowerCase();
		if (recordId.length === 0 || table.length === 0) {
			return [];
		}

		const query =
			`?$select=${this.column("username")},${this.column("userid")}` +
			`&$filter=${this.column("recordid")} eq '${recordId}' and ` +
			`${this.column("recordtable")} eq '${encodeURIComponent(table)}'` +
			`&$top=200`;

		const response = await this.webAPI.retrieveMultipleRecords(this.table, query, 200);

		const mentions: LoggedMention[] = [];
		for (const entity of response.entities as Record<string, string | undefined>[]) {
			const name = (entity[this.column("username")] ?? "").trim();
			const userId = normalizeGuid(entity[this.column("userid")] ?? "");
			if (name.length > 0 && userId.length > 0) {
				mentions.push({ name, userId });
			}
		}

		return mentions;
	}

	private column(name: string): string {
		return `${this.prefix}${name}`;
	}

	private buildRow(request: MentionRequest, recipient: string): ComponentFramework.WebApi.Entity {
		const row: Record<string, string> = {};
		const put = (name: string, value: string | undefined, max: number): void => {
			const text = clip(value ?? "", max);
			if (text.length > 0) {
				row[this.column(name)] = text;
			}
		};

		const record = clip(request.recordName ?? "", LIMITS.recordname);
		put("name", record.length > 0 ? `@${request.recipient.name} · ${record}` : `@${request.recipient.name}`, LIMITS.name);
		put("userid", recipient, LIMITS.id);
		put("username", request.recipient.name, LIMITS.username);
		put("useremail", request.recipient.email, LIMITS.useremail);
		put("mentionedbyid", normalizeGuid(request.senderUserId), LIMITS.id);
		put("recordtable", request.entityName?.toLowerCase(), LIMITS.recordtable);
		put("recordid", normalizeGuid(request.entityId ?? ""), LIMITS.id);
		put("recordname", request.recordName, LIMITS.recordname);
		put("recordurl", request.recordUrl, LIMITS.recordurl);
		put("channel", request.channel, LIMITS.channel);
		put("subject", request.subject, LIMITS.subject);
		put("message", request.message, LIMITS.message);
		put("linktext", request.linkText, LIMITS.linktext);
		put("deliverystatus", STATUS_NEW, LIMITS.id);

		return row;
	}
}
