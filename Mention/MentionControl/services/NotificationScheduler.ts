/**
 * Holds a notification back for a grace period and drops it if the mention it belongs to is
 * gone by the time it would go out.
 *
 * A mention lands in the text the moment it is picked, but the mail must not: picking one entry
 * off the list happens, and "you were mentioned" cannot be taken back. Waiting also covers the
 * form the user abandons — the mention was never saved, so nobody should hear about it.
 *
 * Kept free of the platform so the timing, the de-duplication and the withdrawal rule can be
 * exercised directly.
 */
export interface ScheduledNotification<TPayload> {
	/** Identifies the recipient; a second notification for the same key is ignored. */
	readonly key: string;
	/** The name whose presence in the text decides whether the mail still applies. */
	readonly mentionName: string;
	readonly payload: TPayload;
}

export class NotificationScheduler<TPayload> {
	private readonly delayMs: number;
	private readonly send: (payload: TPayload) => Promise<void>;
	private readonly isStillMentioned: (mentionName: string) => boolean;

	/** Recipients whose notification went out, by key, with the name it used. */
	private readonly sent = new Map<string, string>();
	/** Notifications waiting out the delay, by key. */
	private readonly waiting = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(
		delayMs: number,
		send: (payload: TPayload) => Promise<void>,
		isStillMentioned: (mentionName: string) => boolean
	) {
		this.delayMs = delayMs;
		this.send = send;
		this.isStillMentioned = isStillMentioned;
	}

	/** True when this recipient already has a notification sent or on its way. */
	public isPending(key: string): boolean {
		return this.sent.has(key) || this.waiting.has(key);
	}

	/**
	 * Resolves once the notification went out, or once it was dropped because the mention was
	 * withdrawn. Rejects only when sending itself failed.
	 */
	public async schedule(item: ScheduledNotification<TPayload>): Promise<void> {
		if (this.isPending(item.key)) {
			return;
		}

		return new Promise<void>((resolve, reject) => {
			const handle = setTimeout(() => {
				this.waiting.delete(item.key);

				if (!this.isStillMentioned(item.mentionName)) {
					resolve();
					return;
				}

				// Claim the recipient before sending, so a second mention cannot race it.
				this.sent.set(item.key, item.mentionName);
				void (async () => {
					try {
						await this.send(item.payload);
						resolve();
					} catch (error) {
						// Not reached: stays eligible for another attempt.
						this.sent.delete(item.key);
						reject(error instanceof Error ? error : new Error(String(error)));
					}
				})();
			}, this.delayMs);

			this.waiting.set(item.key, handle);
		});
	}

	/**
	 * Drops everything still waiting. Used when the component goes away: the grace period exists
	 * so a mention the author did not keep never turns into a mail, and closing a form without
	 * saving is exactly that case. The cost is that picking a mention and saving within the grace
	 * period sends nothing — recoverable by mentioning again, unlike a mail that already went out.
	 */
	public cancelPending(): void {
		for (const handle of this.waiting.values()) {
			clearTimeout(handle);
		}
		this.waiting.clear();
	}

	/**
	 * Forgets recipients whose mention is no longer in the text, so making the mention again
	 * notifies them again.
	 */
	public dropWithdrawn(): void {
		for (const [key, mentionName] of this.sent) {
			if (!this.isStillMentioned(mentionName)) {
				this.sent.delete(key);
			}
		}
	}
}
