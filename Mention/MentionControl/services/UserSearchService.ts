import { escapeODataLiteral } from "../utils/mentionText";

export interface UserSuggestion {
	readonly id: string;
	readonly name: string;
	readonly email?: string;
	readonly jobTitle?: string;
}

export interface UserSearchResult {
	readonly users: UserSuggestion[];
	/** True when the server had more matches than were returned. */
	readonly hasMore: boolean;
}

interface SystemUserRecord {
	systemuserid?: string;
	fullname?: string;
	internalemailaddress?: string;
	jobtitle?: string;
	applicationid?: string | null;
	accessmode?: number | null;
}

const SELECT = "systemuserid,fullname,internalemailaddress,jobtitle,applicationid,accessmode";

/** Access modes that cannot hold a mailbox: 3 = Support User, 4 = Non-interactive. */
const UNMAILABLE_ACCESS_MODES = [3, 4];

/**
 * Looks up enabled Dataverse users through the supported context.webAPI surface.
 *
 * context.webAPI only offers CRUD operations, so the query is expressed as OData.
 * https://learn.microsoft.com/power-apps/developer/component-framework/reference/webapi
 */
export class UserSearchService {
	private readonly webAPI: ComponentFramework.WebApi;
	private readonly pageSize: number;

	constructor(webAPI: ComponentFramework.WebApi, pageSize = 10) {
		this.webAPI = webAPI;
		this.pageSize = pageSize;
	}

	public async search(term: string): Promise<UserSearchResult> {
		const filters = ["isdisabled eq false"];
		const trimmed = term.trim();
		if (trimmed.length > 0) {
			// The literal is escaped for OData and then encoded for the URL. Without the encoding
			// an "&" or a "?" in a name would cut the query string in half, and a typed "%27"
			// would survive as a quote and undo the escaping.
			const literal = encodeURIComponent(escapeODataLiteral(trimmed));
			filters.push(`contains(fullname,'${literal}')`);
		}

		// Application (service) users and the built-in support accounts have no mailbox to write
		// to. They are excluded by the server rather than by the loop below, because dropping them
		// from a page that is already full leaves the list short — or empty — as soon as enough of
		// them sort to the front of the alphabet.
		const mailable = [
			"applicationid eq null",
			...UNMAILABLE_ACCESS_MODES.map((mode) => `accessmode ne ${mode.toString()}`),
		];

		try {
			// One more than the page size, so a full page can be told apart from a truncated result.
			return await this.query([...filters, ...mailable], this.pageSize + 1);
		} catch (error) {
			// An organisation that will not filter on those columns must not lose the lookup
			// altogether. The same query without them still works and the check in the loop still
			// keeps the accounts out of the list — it can only leave the list short, so the surplus
			// is doubled to leave room for the ones that drop out.
			console.warn("[MentionControl] user query without service accounts failed, retrying", error);
			return this.query(filters, this.pageSize * 2 + 1);
		}
	}

	private async query(filters: readonly string[], limit: number): Promise<UserSearchResult> {
		const query =
			`?$select=${SELECT}` +
			`&$filter=${filters.join(" and ")}` +
			`&$orderby=fullname asc` +
			`&$top=${limit.toString()}`;

		const response = await this.webAPI.retrieveMultipleRecords("systemuser", query, limit);

		const suggestions: UserSuggestion[] = [];
		let hasMore = false;

		for (const entity of response.entities as SystemUserRecord[]) {
			const id = entity.systemuserid;
			const name = entity.fullname;

			// Application users and the built-in system accounts have no mailbox to write to.
			if (!id || !name || entity.applicationid || UNMAILABLE_ACCESS_MODES.includes(entity.accessmode ?? 0)) {
				continue;
			}

			if (suggestions.length === this.pageSize) {
				hasMore = true;
				break;
			}

			suggestions.push({
				id,
				name,
				email: entity.internalemailaddress ?? undefined,
				jobTitle: entity.jobtitle ?? undefined,
			});
		}

		return { users: suggestions, hasMore };
	}
}
