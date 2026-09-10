import { escapeODataLiteral } from "../utils/mentionText";

export interface UserSuggestion {
	readonly id: string;
	readonly name: string;
	readonly email?: string;
	readonly jobTitle?: string;
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

	public async search(term: string): Promise<UserSuggestion[]> {
		const filters = ["isdisabled eq false"];
		const trimmed = term.trim();
		if (trimmed.length > 0) {
			filters.push(`contains(fullname,'${escapeODataLiteral(trimmed)}')`);
		}

		// Application (service) users are filtered out on the client so that the OData query
		// stays limited to columns that are guaranteed to be filterable.
		const query =
			`?$select=${SELECT}` +
			`&$filter=${filters.join(" and ")}` +
			`&$orderby=fullname asc` +
			`&$top=${this.pageSize * 2}`;

		const response = await this.webAPI.retrieveMultipleRecords("systemuser", query, this.pageSize * 2);

		const suggestions: UserSuggestion[] = [];
		for (const entity of response.entities as SystemUserRecord[]) {
			const id = entity.systemuserid;
			const name = entity.fullname;

			// Application (service) users have an applicationid and cannot receive mail.
			if (!id || !name || entity.applicationid) {
				continue;
			}

			suggestions.push({
				id,
				name,
				email: entity.internalemailaddress ?? undefined,
				jobTitle: entity.jobtitle ?? undefined,
			});

			if (suggestions.length === this.pageSize) {
				break;
			}
		}

		return suggestions;
	}
}
