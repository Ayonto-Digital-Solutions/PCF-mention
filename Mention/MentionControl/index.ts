import * as React from "react";
import type { Theme } from "@fluentui/react-components";
import type { IInputs, IOutputs } from "./generated/ManifestTypes";
import { MentionEditor, type MentionEditorProps, type MentionEditorStrings } from "./components/MentionEditor";
import { EmailNotificationService } from "./services/EmailNotificationService";
import { UserSearchService, type UserSuggestion } from "./services/UserSearchService";
import { buildRecordUrl, normalizeGuid } from "./utils/mentionText";

/** Value of the sendEmail choice that switches notifications on. */
const SEND_EMAIL_ENABLED = "0";

const DEFAULT_SUBJECT_KEY = "Notification_DefaultSubject";
const DEFAULT_BODY_KEY = "Notification_DefaultBody";

export class MentionControl implements ComponentFramework.ReactControl<IInputs, IOutputs> {
	private notifyOutputChanged: () => void;
	private context: ComponentFramework.Context<IInputs>;
	private userSearch: UserSearchService;
	private notifications: EmailNotificationService;

	/** Users already notified for this record in this session, so a re-mention does not spam them. */
	private readonly notified = new Set<string>();
	private value = "";

	/** True between notifyOutputChanged and the getOutputs call that picks the value up. */
	private hasPendingOutput = false;
	private isDisposed = false;

	public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void): void {
		this.context = context;
		this.notifyOutputChanged = notifyOutputChanged;
		this.value = context.parameters.field.raw ?? "";
		this.userSearch = new UserSearchService(context.webAPI);
		this.notifications = new EmailNotificationService(context.webAPI, context.utils);
		context.mode.trackContainerResize(true);
	}

	public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
		this.context = context;

		const field = context.parameters.field;

		// The platform can call updateView with a value that predates the edit that is still on
		// its way out. Adopting it would silently roll the column back, so incoming values are
		// only taken over once the pending output has been collected.
		if (!this.hasPendingOutput) {
			this.value = field.raw ?? "";
		}

		const props: MentionEditorProps = {
			value: this.value,
			disabled: context.mode.isControlDisabled || field.security?.editable === false,
			masked: field.security?.readable === false,
			maxLength: field.attributes?.MaxLength,
			theme: context.fluentDesignLanguage?.tokenTheme as Theme | undefined,
			strings: this.getStrings(),
			formatNumber: this.formatNumber,
			searchUsers: this.searchUsers,
			onChange: this.onChange,
			onMention: this.onMention,
		};

		return React.createElement(MentionEditor, props);
	}

	public getOutputs(): IOutputs {
		this.hasPendingOutput = false;
		return { field: this.value };
	}

	public destroy(): void {
		this.isDisposed = true;
		this.notified.clear();
	}

	private readonly onChange = (value: string): void => {
		this.value = value;
		this.hasPendingOutput = true;
		this.notifyOutputChanged();
	};

	private readonly formatNumber = (value: number): string => this.context.formatting.formatInteger(value);

	private readonly searchUsers = async (term: string): Promise<UserSuggestion[]> => {
		if (this.isDisposed) {
			return [];
		}
		return this.userSearch.search(term);
	};

	private readonly onMention = async (user: UserSuggestion): Promise<void> => {
		if (this.isDisposed || this.context.parameters.sendEmail.raw !== SEND_EMAIL_ENABLED) {
			return;
		}
		if (this.notified.has(user.id)) {
			return;
		}

		const parameters = this.context.parameters;
		const entityName = parameters.entityName.raw ?? undefined;
		const entityId = parameters.entityId.raw ?? undefined;

		// Reserve the recipient before awaiting, so two quick mentions cannot both pass the check.
		this.notified.add(user.id);
		try {
			await this.notifications.notify({
				recipient: user,
				senderUserId: normalizeGuid(parameters.senderUserId.raw) || normalizeGuid(this.context.userSettings.userId),
				subject: parameters.emailSubject.raw ?? this.resource(DEFAULT_SUBJECT_KEY),
				body: parameters.emailContent.raw ?? this.resource(DEFAULT_BODY_KEY),
				recordUrl: buildRecordUrl({
					orgUrl: parameters.orgUrl.raw,
					entityName,
					entityId,
					appId: parameters.appId.raw,
				}),
				recordLinkLabel: this.resource("Notification_OpenRecord"),
				entityName,
				entityId,
			});
		} catch (error) {
			// The guard exists to prevent duplicate deliveries, not to swallow failed ones, so a
			// recipient that was not reached stays eligible for the next attempt.
			this.notified.delete(user.id);
			throw error;
		}
	};

	private resource(key: string): string {
		return this.context.resources.getString(key);
	}

	private getStrings(): MentionEditorStrings {
		return {
			placeholder: this.resource("Editor_Placeholder"),
			noResults: this.resource("Editor_NoResults"),
			searching: this.resource("Editor_Searching"),
			suggestionCount: (count: string) => `${count} ${this.resource("Editor_SuggestionCount")}`,
			charactersLeft: (remaining: string) => `${remaining} ${this.resource("Editor_CharactersLeft")}`,
			notificationFailed: this.resource("Editor_NotificationFailed"),
			lookupFailed: this.resource("Editor_LookupFailed"),
			maskedValue: this.resource("Editor_MaskedValue"),
		};
	}
}
