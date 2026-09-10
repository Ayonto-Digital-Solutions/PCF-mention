import * as React from "react";
import type { Theme } from "@fluentui/react-components";
import type { IInputs, IOutputs } from "./generated/ManifestTypes";
import { MentionEditor, type MentionEditorProps, type MentionEditorStrings } from "./components/MentionEditor";
import {
	EmailNotificationService,
	type NotificationRequest,
} from "./services/EmailNotificationService";
import { NotificationScheduler } from "./services/NotificationScheduler";
import {
	UserSearchService,
	type UserSearchResult,
	type UserSuggestion,
} from "./services/UserSearchService";
import { mentionBlocker } from "./utils/availability";
import { interpolate } from "./utils/format";
import { buildRecordUrl, containsMention, normalizeGuid } from "./utils/mentionText";

/** Value of the sendEmail choice that switches notifications on. */
const SEND_EMAIL_ENABLED = "0";

const DEFAULT_SUBJECT_KEY = "Notification_DefaultSubject";
const DEFAULT_BODY_KEY = "Notification_DefaultBody";

/**
 * How long a notification waits before it goes out.
 *
 * A mention is sent the moment it is picked, but the mail is not: picking one entry off the list
 * happens, and a mail saying "you were mentioned" cannot be taken back. The wait is long enough to
 * delete a wrong pick and short enough that nobody notices it.
 */
const NOTIFICATION_DELAY_MS = 5000;

export class MentionControl implements ComponentFramework.ReactControl<IInputs, IOutputs> {
	private notifyOutputChanged: () => void;
	private context: ComponentFramework.Context<IInputs>;
	private userSearch: UserSearchService;
	private notifications: EmailNotificationService;

	private scheduler: NotificationScheduler<NotificationRequest>;
	private value = "";
	/** The value the platform was carrying before the edit it has not caught up with yet. */
	private staleValue: string | undefined;

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
		this.scheduler = new NotificationScheduler(
			NOTIFICATION_DELAY_MS,
			async (request: NotificationRequest) => this.notifications.notify(request),
			(mentionName: string) => containsMention(this.value, mentionName)
		);
	}

	public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
		this.context = context;

		const field = context.parameters.field;

		// The platform reports the column asynchronously, so an updateView can still carry the text
		// as it was before the last edit. Exactly that one value is ignored — anything else is news
		// and is followed, so a platform that never echoes a value back cannot wedge the component.
		// Editing is the second reason to ignore: while the editor has the focus it owns the text.
		const incoming = field.raw ?? "";
		if (incoming === this.value) {
			this.staleValue = undefined;
		} else if (incoming !== this.staleValue && (!this.isEditing || context.mode.isControlDisabled)) {
			this.value = incoming;
			this.staleValue = undefined;
		}

		const props: MentionEditorProps = {
			value: this.value,
			disabled: context.mode.isControlDisabled || field.security?.editable === false,
			masked: field.security?.readable === false,
			maxLength: field.attributes?.MaxLength,
			label: context.mode.label,
			notice: this.mentionNotice(context),
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
		// Notifications already on their way are deliberately left to run: the mention is in the
		// column, and the delay is a grace period, not a reason to drop one when a form closes.
		this.isDisposed = true;
	}

	private readonly onChange = (value: string): void => {
		// Remember what the platform still has, so a late update carrying it can be told apart
		// from a genuinely new value.
		this.staleValue ??= this.value;
		this.value = value;
		// A mention that was deleted can be made again, and should notify again.
		this.scheduler.dropWithdrawn();
		this.notifyOutputChanged();
	};

	private readonly onEditingChange = (isEditing: boolean): void => {
		this.isEditing = isEditing;
	};

	private readonly formatNumber = (value: number): string => this.context.formatting.formatInteger(value);

	private readonly searchUsers = async (term: string): Promise<UserSearchResult> => {
		if (this.isDisposed || this.mentionNotice(this.context) !== undefined) {
			return { users: [], hasMore: false };
		}
		return this.userSearch.search(term);
	};

	/**
	 * Dataverse is unreachable offline, and a record that was never saved has no id to point a
	 * notification at. In both cases mentioning is unavailable and the editor says why rather
	 * than letting the lookup fail or sending a mail that leads nowhere.
	 */
	private mentionNotice(context: ComponentFramework.Context<IInputs>): string | undefined {
		const blocker = mentionBlocker({
			isOffline: this.isOffline(),
			notificationsEnabled: context.parameters.sendEmail.raw === SEND_EMAIL_ENABLED,
			entityNameConfigured: this.configured(context.parameters.entityName.raw) !== undefined,
			hasRecordId: normalizeGuid(context.parameters.entityId.raw).length > 0,
		});

		switch (blocker) {
			case "offline":
				return this.resource("Editor_OfflineNotice");
			case "unsaved-record":
				return this.resource("Editor_UnsavedRecordNotice");
			default:
				return undefined;
		}
	}

	private isOffline(): boolean {
		const client = this.context.client;
		if (typeof client.isOffline === "function" && client.isOffline()) {
			return true;
		}
		return typeof client.isNetworkAvailable === "function" && !client.isNetworkAvailable();
	}

	private readonly onMention = async (user: UserSuggestion): Promise<void> => {
		if (this.isDisposed || this.context.parameters.sendEmail.raw !== SEND_EMAIL_ENABLED) {
			return;
		}
		if (this.mentionNotice(this.context) !== undefined) {
			return;
		}

		const recipientId = normalizeGuid(user.id);
		if (recipientId.length === 0 || this.scheduler.isPending(recipientId)) {
			return;
		}

		// Everything the mail needs is read now, while the context is current. The wait that
		// follows only decides whether to send it.
		await this.scheduler.schedule({
			key: recipientId,
			mentionName: user.name,
			payload: this.buildRequest(user, recipientId),
		});
	};

	private buildRequest(user: UserSuggestion, recipientId: string): NotificationRequest {
		const parameters = this.context.parameters;
		const entityName = parameters.entityName.raw ?? undefined;
		const entityId = parameters.entityId.raw ?? undefined;

		return {
			recipient: { ...user, id: recipientId },
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
		};
	}

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
			mentionTooLong: this.resource("Editor_MentionTooLong"),
			moreResults: this.resource("Editor_MoreResults"),
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
