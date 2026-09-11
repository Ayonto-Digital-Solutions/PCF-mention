import * as React from "react";
import type { Theme } from "@fluentui/react-components";
import type { IInputs, IOutputs } from "./generated/ManifestTypes";
import { MentionEditor, type MentionEditorProps, type MentionEditorStrings } from "./components/MentionEditor";
import {
	MentionLogService,
	type LoggedMention,
	type MentionChannel,
	type MentionRequest,
} from "./services/MentionLogService";
import { NotificationScheduler } from "./services/NotificationScheduler";
import {
	UserSearchService,
	type UserSearchResult,
	type UserSuggestion,
} from "./services/UserSearchService";
import { mentionBlocker } from "./utils/availability";
import { interpolate } from "./utils/format";
import { buildRecordUrl, normalizeGuid } from "./utils/mentionText";

/** Value of a channel's choice property that switches it on. */
const CHANNEL_ENABLED = "0";

const DEFAULT_SUBJECT_KEY = "Notification_DefaultSubject";
const DEFAULT_BODY_KEY = "Notification_DefaultBody";
const DEFAULT_LINK_TEXT_KEY = "Default_LinkText";

/**
 * How long a notification waits before it goes out.
 *
 * A mention lands in the text the moment it is picked, but the notification must not: picking the
 * wrong entry off the list happens, and "you were mentioned" cannot be taken back. The wait is long
 * enough to delete a wrong pick and short enough that nobody notices it. Only the first mention of
 * a person schedules one — the rest of the text may name them as often as it likes.
 */
const NOTIFICATION_DELAY_MS = 5000;

export class MentionControl implements ComponentFramework.ReactControl<IInputs, IOutputs> {
	private notifyOutputChanged: () => void;
	private context: ComponentFramework.Context<IInputs>;
	private userSearch: UserSearchService;
	private mentions: MentionLogService;

	private scheduler: NotificationScheduler<MentionRequest[]>;
	private value = "";
	/** The value the platform was carrying before the edit it has not caught up with yet. */
	private staleValue: string | undefined;

	/** True while the editor has the focus, which is exactly when it owns the text. */
	private isEditing = false;

	/**
	 * Who the text mentions right now, as the editor reports it — by user id, because a display
	 * name does not identify a person. A pending notification applies only while its recipient
	 * is in here.
	 */
	private writtenMentions = new Set<string>();

	/**
	 * The record as the host reports it, for hosts that report one at all.
	 *
	 * The documented way to the record is the other one: bind entityId to the primary key column
	 * and set entityName, which is what the FAQ tells makers to do and what the form designer
	 * offers. context.mode.contextInfo appears in no reference and in no version of the type
	 * definitions — hence the cast — so it is read only where those properties are empty, and
	 * nothing here may depend on it being there.
	 * https://learn.microsoft.com/power-apps/developer/component-framework/faq#how-can-i-access-the-record-id-or-table-name
	 */
	private get hostRecord(): { entityId?: string | null; entityTypeName?: string | null; entityRecordName?: string | null } {
		return (
			(
				this.context.mode as {
					contextInfo?: { entityId?: string | null; entityTypeName?: string | null; entityRecordName?: string | null };
				}
			).contextInfo ?? {}
		);
	}

	private get recordId(): string {
		return normalizeGuid(this.context.parameters.entityId.raw) || normalizeGuid(this.hostRecord.entityId);
	}

	/** What the record is called. Only the host knows, so it is often absent. */
	private get recordName(): string | undefined {
		return this.configured((this.hostRecord as { entityRecordName?: string | null }).entityRecordName ?? null);
	}

	private get recordEntityName(): string | undefined {
		return (
			this.configured(this.context.parameters.entityName.raw) ??
			this.configured(this.hostRecord.entityTypeName ?? null)
		);
	}
	private isDisposed = false;
	private strings?: MentionEditorStrings;

	public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void): void {
		this.context = context;
		this.notifyOutputChanged = notifyOutputChanged;
		this.value = context.parameters.field.raw ?? "";
		this.userSearch = new UserSearchService(context.webAPI);
		this.mentions = new MentionLogService(context.webAPI, context.parameters.mentionTable.raw ?? undefined);
		this.scheduler = new NotificationScheduler(
			NOTIFICATION_DELAY_MS,
			async (requests: MentionRequest[]) => {
				// One row per channel, written in order. A channel that fails to write does not
				// stop the other — the person should hear about the mention on whichever way works.
				for (const request of requests) {
					await this.mentions.write(request);
				}
			},
			(userId: string) => this.writtenMentions.has(userId)
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
		} else if (incoming === this.staleValue) {
			// The platform is allowed to be one update behind, not to be overruled for good: a
			// business rule or a discarded form can legitimately put that same text back, and the
			// next update carrying it is taken.
			this.staleValue = undefined;
		} else if (!this.isEditing || context.mode.isControlDisabled) {
			this.value = incoming;
			this.staleValue = undefined;
		}

		const props: MentionEditorProps = {
			value: this.value,
			disabled: context.mode.isControlDisabled || field.security?.editable === false,
			masked: field.security?.readable === false,
			maxLength: field.attributes?.MaxLength,
			label: context.mode.label,
			notice: this.mentionNotice(),
			theme: context.fluentDesignLanguage?.tokenTheme as Theme | undefined,
			strings: this.getStrings(),
			formatNumber: this.formatNumber,
			searchUsers: this.searchUsers,
			onChange: this.onChange,
			onEditingChange: this.onEditingChange,
			onMention: this.onMention,
			onWrittenMentionsChange: this.onWrittenMentionsChange,
			recordKey: `${this.recordEntityName ?? ""}:${this.recordId}`,
			loadMentions: this.loadMentions,
			onOpenUser: this.onOpenUser,
		};

		return React.createElement(MentionEditor, props);
	}

	public getOutputs(): IOutputs {
		return { field: this.value };
	}

	public destroy(): void {
		this.isDisposed = true;
		// The control is torn down for every reason there is — a saved form that closes, a tab
		// that moves on, a form that is discarded — and a code component is not told which. What
		// is still waiting therefore goes out now rather than being dropped on the guess that the
		// record was abandoned: a notification nobody sends is one the author believes was sent.
		this.scheduler.flushPending();
	}

	private readonly onChange = (value: string): void => {
		// Remember what the platform still has, so a late update carrying it can be told apart
		// from a genuinely new value.
		this.staleValue ??= this.value;
		this.value = value;
		this.notifyOutputChanged();
	};

	private readonly onEditingChange = (isEditing: boolean): void => {
		this.isEditing = isEditing;
	};

	private readonly onWrittenMentionsChange = (userIds: readonly string[]): void => {
		this.writtenMentions = new Set(userIds.map((id) => normalizeGuid(id)));
		// A mention that was taken back can be made again, and should notify again.
		this.scheduler.dropWithdrawn();
	};

	private readonly formatNumber = (value: number): string => this.context.formatting.formatInteger(value);

	/** The mentions this record already carries, so the names in the text can become links. */
	private readonly loadMentions = async (): Promise<readonly LoggedMention[]> => {
		const entityName = this.recordEntityName;
		if (this.isDisposed || entityName === undefined || this.recordId.length === 0) {
			return [];
		}
		return this.mentions.listFor(entityName, this.recordId);
	};

	private readonly onOpenUser = (userId: string): void => {
		const id = normalizeGuid(userId);
		if (id.length === 0) {
			return;
		}
		void this.context.navigation.openForm({ entityName: "systemuser", entityId: id });
	};

	private readonly searchUsers = async (term: string): Promise<UserSearchResult> => {
		if (this.isDisposed || this.mentionNotice() !== undefined) {
			return { users: [], hasMore: false };
		}
		return this.userSearch.search(term);
	};

	/**
	 * Dataverse is unreachable offline, and a record that was never saved has no id to point a
	 * notification at. In both cases mentioning is unavailable and the editor says why rather
	 * than letting the lookup fail or sending a mail that leads nowhere.
	 */
	private mentionNotice(): string | undefined {
		const blocker = mentionBlocker({
			isOffline: this.isOffline(),
			notificationsEnabled: this.enabledChannels().length > 0,
			entityNameConfigured: this.recordEntityName !== undefined,
			hasRecordId: this.recordId.length > 0,
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
		if (this.isDisposed || this.enabledChannels().length === 0) {
			return;
		}
		if (this.mentionNotice() !== undefined) {
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
			payload: this.buildRequests(user, recipientId),
		});
	};

	/** The channels the maker switched on, in the order their rows are written. */
	private enabledChannels(): MentionChannel[] {
		const parameters = this.context.parameters;
		const channels: MentionChannel[] = [];
		if (parameters.sendEmail.raw === CHANNEL_ENABLED) {
			channels.push("Email");
		}
		if (parameters.sendTeams.raw === CHANNEL_ENABLED) {
			channels.push("Teams");
		}
		return channels;
	}

	/**
	 * One request per switched-on channel.
	 *
	 * Each carries its own subject, text and link label, because a chat message is read somewhere
	 * else than a mail and rarely wants the same wording. Where a channel says nothing of its own,
	 * the e-mail wording stands in — configuring the same text twice is the more common case.
	 */
	private buildRequests(user: UserSuggestion, recipientId: string): MentionRequest[] {
		const parameters = this.context.parameters;
		const entityName = this.recordEntityName;
		const entityId = this.recordId.length > 0 ? this.recordId : undefined;

		const subject = this.configured(parameters.emailSubject.raw) ?? this.resource(DEFAULT_SUBJECT_KEY);
		const message = this.configured(parameters.emailContent.raw) ?? this.resource(DEFAULT_BODY_KEY);
		const linkText = this.configured(parameters.emailLinkText.raw) ?? this.resource(DEFAULT_LINK_TEXT_KEY);

		const wording: Record<MentionChannel, { subject: string; message: string; linkText: string }> = {
			Email: { subject, message, linkText },
			Teams: {
				subject: this.configured(parameters.teamsSubject.raw) ?? subject,
				message: this.configured(parameters.teamsContent.raw) ?? message,
				linkText: this.configured(parameters.teamsLinkText.raw) ?? linkText,
			},
		};

		const shared = {
			recipient: { ...user, id: recipientId },
			senderUserId: normalizeGuid(parameters.senderUserId.raw) || normalizeGuid(this.context.userSettings.userId),
			recordName: this.recordName,
			recordUrl: buildRecordUrl({
				orgUrl: parameters.orgUrl.raw,
				entityName,
				entityId,
				appId: parameters.appId.raw,
			}),
			entityName,
			entityId,
		};

		return this.enabledChannels().map((channel) => ({ ...shared, channel, ...wording[channel] }));
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
