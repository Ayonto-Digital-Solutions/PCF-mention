/**
 * Decides whether mentioning is available right now, and if not, why.
 *
 * Kept free of the platform so the whole truth table can be exercised directly.
 */

export type MentionBlocker = "offline" | "unsaved-record";

export interface MentionAvailability {
	/** Dataverse cannot be reached. */
	readonly isOffline: boolean;
	/** At least one notification channel is set to Yes. */
	readonly notificationsEnabled: boolean;
	/** The grantAccess choice is set to Yes. */
	readonly accessRequested: boolean;
	/** The maker bound the entityName property. */
	readonly entityNameConfigured: boolean;
	/** The platform handed the component a record id. */
	readonly hasRecordId: boolean;
}

/**
 * Returns the reason mentioning is unavailable, or undefined when it is available.
 *
 * Offline wins: without a connection the user lookup cannot run at all.
 *
 * A record with no id is one the user is still creating. Notifying about it would send a mail
 * that points nowhere, and the mention itself may never be saved. That only counts as a blocker
 * when the maker actually bound the record properties — with neither configured, the component
 * is deliberately running without a record link and notifications are still wanted.
 *
 * Read access counts the same way. It is granted on a record, so a record that has no id yet has
 * nothing to grant on; with neither property configured there is no record either, and only the
 * notifications go out.
 */
export function mentionBlocker(state: MentionAvailability): MentionBlocker | undefined {
	if (state.isOffline) {
		return "offline";
	}

	const writesRows = state.notificationsEnabled || state.accessRequested;
	if (writesRows && state.entityNameConfigured && !state.hasRecordId) {
		return "unsaved-record";
	}

	return undefined;
}
