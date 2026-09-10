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
}

const SELECT = "systemuserid,fullname,internalemailaddress,jobtitle,applicationid";

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
			filters.push(`contains(fullname,'${escapeODataLiteral(trimmed)}')`);
		}

		// One more than the page size, so a full page can be told apart from a truncated result.
		// Application (service) users are filtered out on the client, which keeps the OData query
		// limited to columns that are guaranteed to be filterable, so the surplus is doubled to
		// leave room for the ones that drop out.
		const limit = this.pageSize * 2 + 1;
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

			// Application (service) users have an applicationid and cannot receive mail.
			if (!id || !name || entity.applicationid) {
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
