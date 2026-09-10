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
	readonly recordLinkLabel?: string;
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
 * the environment as a draft and can be picked up by a flow.
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
		const sender = normalizeGuid(request.senderUserId);
		const recipient = normalizeGuid(request.recipient.id);
		if (sender.length === 0 || recipient.length === 0) {
			throw new NotificationError("A notification needs both a sender and a recipient.");
		}

		const created = await this.webAPI.createRecord("email", this.buildPayload(request, sender, recipient));
		const emailId = normalizeGuid(created.id);

		// Linking is deliberately a separate step: the navigation property for the regarding
		// lookup is not derivable from the table name (accounts use
		// regardingobjectid_account_email, async operations regardingobjectid_asyncoperation),
		// so a wrong guess must never take the notification down with it.
		await this.linkToRecord(emailId, request.entityName, request.entityId);
		await this.send(emailId);
	}

	private buildPayload(
		request: NotificationRequest,
		sender: string,
		recipient: string
	): ComponentFramework.WebApi.Entity {
		return {
			subject: request.subject,
			description: this.buildBody(request),
			email_activity_parties: [
				{
					"partyid_systemuser@odata.bind": `/systemusers(${sender})`,
					participationtypemask: ParticipationType.Sender,
				},
				{
					"partyid_systemuser@odata.bind": `/systemusers(${recipient})`,
					participationtypemask: ParticipationType.ToRecipient,
				},
			],
		};
	}

	private buildBody(request: NotificationRequest): string {
		const paragraphs = [`<p>${escapeHtml(request.body).replace(/\r?\n/g, "<br />")}</p>`];

		if (request.recordUrl) {
			const label = request.recordLinkLabel ?? request.recordUrl;
			paragraphs.push(`<p><a href="${escapeHtml(request.recordUrl)}">${escapeHtml(label)}</a></p>`);
		}

		return paragraphs.join("");
	}

	/**
	 * Points the e-mail's regarding lookup at the record the mention was written on, so it shows
	 * up in that record's timeline. Best effort throughout: the notification is what matters.
	 */
	private async linkToRecord(emailId: string, entityName?: string, entityId?: string): Promise<void> {
		const logicalName = (entityName ?? "").trim().toLowerCase();
		const recordId = normalizeGuid(entityId);
		if (emailId.length === 0 || logicalName.length === 0 || recordId.length === 0) {
			return;
		}

		try {
			const entitySetName = await this.getEntitySetName(logicalName);
			if (!entitySetName) {
				return;
			}

			const target = `/${entitySetName}(${recordId})`;
			// Most tables carry the activity-type suffix, a few do not.
			for (const property of [`regardingobjectid_${logicalName}_email`, `regardingobjectid_${logicalName}`]) {
				try {
					await this.webAPI.updateRecord("email", emailId, { [`${property}@odata.bind`]: target });
					return;
				} catch {
					// Try the next spelling of the navigation property.
				}
			}

			console.warn(`[MentionControl] could not link the notification to ${logicalName} ${recordId}`);
		} catch (error) {
			console.warn("[MentionControl] could not read table metadata for the regarding link", error);
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
