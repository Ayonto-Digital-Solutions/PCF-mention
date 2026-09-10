/**
 * Holds a notification back for a grace period and drops it if the mention it belongs to is
 * gone by the time it would go out.
 *
 * A mention lands in the text the moment it is picked, but the mail must not: picking one entry
 * off the list happens, and "you were mentioned" cannot be taken back. Deleting the mention again
 * within the grace period is therefore the one thing that stops the mail.
 *
 * Kept free of the platform so the timing, the de-duplication and the withdrawal rule can be
 * exercised directly.
 */
export interface ScheduledNotification<TPayload> {
	/**
	 * Identifies the person. A second notification for the same key is ignored, and this — not
	 * the display name — is what decides whether the notification still applies: two people can
	 * be called the same, and one deleted mention would otherwise vouch for the other.
	 */
	readonly key: string;
	readonly payload: TPayload;
}

export class NotificationScheduler<TPayload> {
	private readonly delayMs: number;
	private readonly send: (payload: TPayload) => Promise<void>;
	private readonly isStillMentioned: (key: string) => boolean;

	/** Recipients whose notification went out. */
	private readonly sent = new Set<string>();
	/** Notifications waiting out the delay, by key, each with the way to let it go now. */
	private readonly waiting = new Map<string, { handle: ReturnType<typeof setTimeout>; fire: () => void }>();

	constructor(
		delayMs: number,
		send: (payload: TPayload) => Promise<void>,
		isStillMentioned: (key: string) => boolean
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
			const fire = () => {
				const waiting = this.waiting.get(item.key);
				if (waiting) {
					clearTimeout(waiting.handle);
					this.waiting.delete(item.key);
				}

				if (!this.isStillMentioned(item.key)) {
					resolve();
					return;
				}

				// Claim the recipient before sending, so a second mention cannot race it.
				this.sent.add(item.key);
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
			};

			this.waiting.set(item.key, { handle: setTimeout(fire, this.delayMs), fire });
		});
	}

	/**
	 * Lets everything that is still waiting go out now, each still subject to the check the timer
	 * would have made. Used when the component goes away.
	 *
	 * Waiting cannot cover the abandoned form after all: a code component is not told whether the
	 * record was saved, and the mention sits in the text either way. Between a mail for a mention
	 * that was discarded and a notification that is silently lost, the mail is the lesser harm —
	 * the discarded one leads to a record without the mention, which is visible and explainable,
	 * while the lost one leaves the author believing somebody was told.
	 */
	public flushPending(): void {
		for (const waiting of [...this.waiting.values()]) {
			waiting.fire();
		}
	}

	/**
	 * Forgets recipients whose mention is no longer in the text, so making the mention again
	 * notifies them again.
	 */
	public dropWithdrawn(): void {
		for (const key of this.sent) {
			if (!this.isStillMentioned(key)) {
				this.sent.delete(key);
			}
		}
	}
}
