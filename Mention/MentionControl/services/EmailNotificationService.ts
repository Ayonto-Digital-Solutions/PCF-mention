import { escapeHtml, normalizeGuid } from "../utils/mentionText";
import type { UserSuggestion } from "./UserSearchService";

/** Web API version used for the bound SendEmail action. */
const WEB_API_VERSION = "v9.2";

/** Dataverse activity party participation types. */
const enum ParticipationType {
	Sender = 1,
	ToRecipient = 2,
}

export interface NotificationRequest {
	readonly recipient: UserSuggestion;
	readonly senderUserId: string;
	readonly subject: string;
	readonly body: string;
	readonly recordUrl?: string;
	readonly entityName?: string;
	readonly entityId?: string;
}

export class NotificationError extends Error {
	public readonly emailId?: string;

	constructor(message: string, emailId?: string) {
		super(message);
		this.name = "NotificationError";
		this.emailId = emailId;
	}
}

/**
 * Creates the e-mail activity through the supported context.webAPI surface and then triggers
 * the bound SendEmail action.
 *
 * context.webAPI has no execute method, so the action is posted against the Web API of the
 * current environment with a same-origin relative URL. If that call fails the e-mail stays in
 * the environment as a draft, linked to the record, and can be picked up by a flow.
 */
export class EmailNotificationService {
	private readonly webAPI: ComponentFramework.WebApi;
	private readonly utils: ComponentFramework.Utility;
	private readonly entitySetNames = new Map<string, string>();

	constructor(webAPI: ComponentFramework.WebApi, utils: ComponentFramework.Utility) {
		this.webAPI = webAPI;
		this.utils = utils;
	}

	public async notify(request: NotificationRequest): Promise<void> {
		const payload = await this.buildPayload(request);
		const created = await this.webAPI.createRecord("email", payload);
		const emailId = normalizeGuid(created.id);

		await this.send(emailId);
	}

	private async buildPayload(request: NotificationRequest): Promise<ComponentFramework.WebApi.Entity> {
		const payload: ComponentFramework.WebApi.Entity = {
			subject: request.subject,
			description: this.buildBody(request),
			email_activity_parties: [
				{
					"partyid_systemuser@odata.bind": `/systemusers(${normalizeGuid(request.senderUserId)})`,
					participationtypemask: ParticipationType.Sender,
				},
				{
					"partyid_systemuser@odata.bind": `/systemusers(${normalizeGuid(request.recipient.id)})`,
					participationtypemask: ParticipationType.ToRecipient,
				},
			],
		};

		const regarding = await this.buildRegardingBinding(request.entityName, request.entityId);
		if (regarding) {
			payload[regarding.property] = regarding.value;
		}

		return payload;
	}

	private buildBody(request: NotificationRequest): string {
		const paragraphs = [`<p>${escapeHtml(request.body).replace(/\r?\n/g, "<br />")}</p>`];

		if (request.recordUrl) {
			paragraphs.push(`<p><a href="${escapeHtml(request.recordUrl)}">${escapeHtml(request.recordUrl)}</a></p>`);
		}

		return paragraphs.join("");
	}

	/**
	 * Links the e-mail to the record it was written on. Needs the plural entity set name, which
	 * is read from the table metadata. Best effort: without it the e-mail is still created.
	 */
	private async buildRegardingBinding(
		entityName?: string,
		entityId?: string
	): Promise<{ property: string; value: string } | undefined> {
		const logicalName = (entityName ?? "").trim().toLowerCase();
		const recordId = normalizeGuid(entityId);
		if (logicalName.length === 0 || recordId.length === 0) {
			return undefined;
		}

		try {
			const entitySetName = await this.getEntitySetName(logicalName);
			if (!entitySetName) {
				return undefined;
			}
			return {
				property: `regardingobjectid_${logicalName}@odata.bind`,
				value: `/${entitySetName}(${recordId})`,
			};
		} catch {
			// Metadata is not reachable for every table (or user). The notification is more
			// important than the link, so the e-mail is created without a regarding record.
			return undefined;
		}
	}

	private async getEntitySetName(logicalName: string): Promise<string | undefined> {
		const cached = this.entitySetNames.get(logicalName);
		if (cached) {
			return cached;
		}

		const metadata = await this.utils.getEntityMetadata(logicalName);
		const entitySetName = metadata?.EntitySetName as string | undefined;
		if (entitySetName) {
			this.entitySetNames.set(logicalName, entitySetName);
		}
		return entitySetName;
	}

	private async send(emailId: string): Promise<void> {
		const response = await fetch(
			`/api/data/${WEB_API_VERSION}/emails(${emailId})/Microsoft.Dynamics.CRM.SendEmail`,
			{
				method: "POST",
				credentials: "same-origin",
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					Accept: "application/json",
					"OData-MaxVersion": "4.0",
					"OData-Version": "4.0",
				},
				body: JSON.stringify({ IssueSend: true }),
			}
		);

		if (!response.ok) {
			throw new NotificationError(
				`SendEmail failed with HTTP ${response.status.toString()} ${response.statusText}`,
				emailId
			);
		}
	}
}
