import * as React from "react";
import type { Theme } from "@fluentui/react-components";
import type { IInputs, IOutputs } from "./generated/ManifestTypes";
import { MentionEditor, type MentionEditorProps, type MentionEditorStrings } from "./components/MentionEditor";
import { EmailNotificationService } from "./services/EmailNotificationService";
import { UserSearchService, type UserSuggestion } from "./services/UserSearchService";
import { interpolate } from "./utils/format";
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

	/** True while the editor has the focus, which is exactly when it owns the text. */
	private isEditing = false;
	private isDisposed = false;
	private strings?: MentionEditorStrings;

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

		// While the editor has the focus it owns the text, and the platform may still be carrying
		// a value that predates the last keystroke. Adopting that would roll the column back, so
		// incoming values are only taken over between edits — the same rule the editor applies to
		// its own state, so the two never disagree.
		if (!this.isEditing) {
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
			onEditingChange: this.onEditingChange,
			onMention: this.onMention,
		};

		return React.createElement(MentionEditor, props);
	}

	public getOutputs(): IOutputs {
		return { field: this.value };
	}

	public destroy(): void {
		this.isDisposed = true;
		this.notified.clear();
	}

	private readonly onChange = (value: string): void => {
		this.value = value;
		this.notifyOutputChanged();
	};

	private readonly onEditingChange = (isEditing: boolean): void => {
		this.isEditing = isEditing;
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
		const recipientId = normalizeGuid(user.id);
		if (this.notified.has(recipientId)) {
			return;
		}

		const parameters = this.context.parameters;
		const entityName = parameters.entityName.raw ?? undefined;
		const entityId = parameters.entityId.raw ?? undefined;

		// Reserve the recipient before awaiting, so two quick mentions cannot both pass the check.
		this.notified.add(recipientId);
		try {
			await this.notifications.notify({
				recipient: user,
				senderUserId: normalizeGuid(parameters.senderUserId.raw) || normalizeGuid(this.context.userSettings.userId),
				subject: this.configured(parameters.emailSubject.raw) ?? this.resource(DEFAULT_SUBJECT_KEY),
				body: this.configured(parameters.emailContent.raw) ?? this.resource(DEFAULT_BODY_KEY),
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
			this.notified.delete(recipientId);
			throw error;
		}
	};

	private resource(key: string): string {
		return this.context.resources.getString(key);
	}

	/** An input property the maker left blank arrives as an empty string, not as null. */
	private configured(value: string | null): string | undefined {
		const trimmed = (value ?? "").trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	/** Resource lookups do not change over the component's life, so they are read once. */
	private getStrings(): MentionEditorStrings {
		this.strings ??= {
			placeholder: this.resource("Editor_Placeholder"),
			noResults: this.resource("Editor_NoResults"),
			searching: this.resource("Editor_Searching"),
			suggestionCount: (count: string) => interpolate(this.resource("Editor_SuggestionCount"), count),
			charactersLeft: (remaining: string) => interpolate(this.resource("Editor_CharactersLeft"), remaining),
			notificationFailed: this.resource("Editor_NotificationFailed"),
			lookupFailed: this.resource("Editor_LookupFailed"),
			maskedValue: this.resource("Editor_MaskedValue"),
		};
		return this.strings;
	}
}
