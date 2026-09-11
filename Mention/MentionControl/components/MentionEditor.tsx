import * as React from "react";
import {
	FluentProvider,
	Link,
	MessageBar,
	MessageBarBody,
	Portal,
	Spinner,
	Text,
	Textarea,
	makeStyles,
	shorthands,
	tokens,
	webLightTheme,
	type Theme,
} from "@fluentui/react-components";
import { SuggestionList } from "./SuggestionList";
import type {
	UserSearchResult,
	UserSuggestion,
} from "../services/UserSearchService";
import {
	applyMention,
	findMentionTrigger,
	mentionDeletionRange,
	mentionSpans,
	reanchorMentions,
	splitMentions,
	type InsertedMention,
	type MentionTrigger,
} from "../utils/mentionText";
import type { LoggedMention } from "../services/MentionLogService";

/** Delay before an "@" query is sent to Dataverse, so typing does not cause one call per keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

/** How tall the list may get. Below that much room, it opens upwards instead. */
const LIST_MAX_HEIGHT = 280;

export interface MentionEditorStrings {
	readonly placeholder: string;
	readonly noResults: string;
	readonly mentionTooLong: string;
	readonly moreResults: string;
	readonly searching: string;
	readonly suggestionCount: (count: string) => string;
	readonly charactersLeft: (remaining: string) => string;
	readonly notificationFailed: string;
	readonly lookupFailed: string;
	readonly maskedValue: string;
}

export interface MentionEditorProps {
	readonly value: string;
	readonly disabled: boolean;
	readonly masked: boolean;
	readonly maxLength?: number;
	/** The column label, so the textarea has a name a screen reader can announce. */
	readonly label?: string;
	/** Set when mentioning is unavailable; explains why, and keeps the picker closed. */
	readonly notice?: string;
	readonly theme?: Theme;
	readonly strings: MentionEditorStrings;
	readonly formatNumber: (value: number) => string;
	readonly searchUsers: (term: string) => Promise<UserSearchResult>;
	readonly onChange: (value: string) => void;
	readonly onEditingChange: (isEditing: boolean) => void;
	readonly onMention: (user: UserSuggestion) => Promise<void>;
	/** Identifies the record, so the mentions written on it are read once per record. */
	readonly recordKey?: string;
	/** The mentions this record already carries, so written names can become links. */
	readonly loadMentions?: () => Promise<readonly LoggedMention[]>;
	/** Opens the user behind a written mention. */
	readonly onOpenUser?: (userId: string) => void;
	/**
	 * Who is mentioned in the text right now, by user id. Two people can share a display name,
	 * so this — not the text — is what decides whether a pending notification still applies.
	 */
	readonly onWrittenMentionsChange?: (userIds: readonly string[]) => void;
}

const useStyles = makeStyles({
	// The host cell is sometimes a flex row, in which case a plain block would shrink to the
	// width of an unstyled textarea — about twenty characters. Growing and filling covers both
	// that case and an ordinary block container.
	provider: {
		display: "block",
		flexGrow: 1,
		minWidth: 0,
		width: "100%",
	},
	root: {
		display: "flex",
		flexDirection: "column",
		minWidth: 0,
		rowGap: tokens.spacingVerticalXS,
		width: "100%",
	},
	textarea: {
		maxWidth: "100%",
		minWidth: 0,
		width: "100%",
	},
	field: {
		position: "relative",
		width: "100%",
	},
	// Laid over the textarea while it does not have the focus, so a written mention can be a
	// link. Its metrics are the ones Fluent gives the textarea itself, or the text would move
	// under the pointer the moment somebody clicks into the field.
	reading: {
		backgroundColor: tokens.colorNeutralBackground1,
		bottom: tokens.strokeWidthThick,
		cursor: "text",
		fontFamily: tokens.fontFamilyBase,
		fontSize: tokens.fontSizeBase300,
		insetInlineStart: "1px",
		insetInlineEnd: "1px",
		lineHeight: tokens.lineHeightBase300,
		overflowY: "auto",
		paddingBlock: tokens.spacingVerticalSNudge,
		paddingInline: `calc(${tokens.spacingHorizontalMNudge} + ${tokens.spacingHorizontalXXS})`,
		position: "absolute",
		top: "1px",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
	},
	placeholder: {
		color: tokens.colorNeutralForeground4,
	},
	// The list is measured against the viewport and rendered through a portal: inside the form
	// it would be cut off by the first ancestor that clips its overflow.
	popup: {
		position: "fixed",
		zIndex: 1000000,
	},
	srOnly: {
		clipPath: "inset(50%)",
		height: "1px",
		overflow: "hidden",
		position: "absolute",
		whiteSpace: "nowrap",
		width: "1px",
	},
	footer: {
		alignItems: "center",
		display: "flex",
		justifyContent: "space-between",
		columnGap: tokens.spacingHorizontalS,
	},
	counter: {
		color: tokens.colorNeutralForeground3,
		marginInlineStart: "auto",
	},
	masked: {
		...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
		...shorthands.borderRadius(tokens.borderRadiusMedium),
		color: tokens.colorNeutralForeground3,
		display: "block",
		paddingBlock: tokens.spacingVerticalS,
		paddingInline: tokens.spacingHorizontalM,
	},
});

const LISTBOX_ID = "ayonto-mention-suggestions";
const optionId = (index: number): string =>
	`${LISTBOX_ID}-option-${index.toString()}`;

export const MentionEditor: React.FC<MentionEditorProps> = (props) => {
	const styles = useStyles();
	const { value, onChange, onEditingChange, onMention, searchUsers, strings } =
		props;

	const [text, setText] = React.useState(value);
	const [trigger, setTrigger] = React.useState<MentionTrigger | null>(null);
	// Results carry the query they answered: during the debounce plus the round trip the list
	// would otherwise still show — and Enter would still pick from — the previous query's matches.
	const [results, setResults] = React.useState<{
		query: string;
		users: readonly UserSuggestion[];
		hasMore: boolean;
	}>({ query: "", users: [], hasMore: false });
	const [activeIndex, setActiveIndex] = React.useState(0);
	const [isSearching, setIsSearching] = React.useState(false);
	const [hasLookupFailed, setHasLookupFailed] = React.useState(false);
	const [message, setMessage] = React.useState<string | undefined>(undefined);
	// Which written names can be shown as links, and where they point. Seeded from the record's
	// own mentions and extended by every mention picked here.
	const [knownMentions, setKnownMentions] = React.useState<
		ReadonlyMap<string, string>
	>(() => new Map());
	// The overlay is a function of the focus: while the editor has it, the plain textarea shows.
	const [isEditing, setIsEditing] = React.useState(false);

	// Only results that answer the query the caret is on may be shown or picked: during the
	// debounce and the round trip that follows it, the previous query's matches are still in hand.
	const answersCurrentQuery =
		trigger !== null && results.query === trigger.query;
	// Memoized so the empty case keeps one identity: the callbacks below depend on it.
	const suggestions = React.useMemo(
		() => (answersCurrentQuery ? results.users : []),
		[answersCurrentQuery, results.users],
	);
	const hasMoreResults = answersCurrentQuery && results.hasMore;

	const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
	/** Where this editor wrote a mention, so typing on past one does not look like a new query. */
	const insertedMentions = React.useRef<InsertedMention[]>([]);
	/**
	 * The text those positions were measured against. Moving them needs the edit, not just its
	 * result: two people of the same name leave two identical mentions, and only the change says
	 * which of them was deleted.
	 */
	const anchoredText = React.useRef(value);
	const reanchor = React.useCallback((next: string): InsertedMention[] => {
		insertedMentions.current = reanchorMentions(
			insertedMentions.current,
			anchoredText.current,
			next,
		);
		anchoredText.current = next;
		return insertedMentions.current;
	}, []);
	const isFocused = React.useRef(false);
	const pendingCaret = React.useRef<number | null>(null);
	/** The grace period outlives a form that closes, so nothing is set on a gone component. */
	const isMounted = React.useRef(true);
	React.useEffect(
		() => () => {
			isMounted.current = false;
		},
		[],
	);

	const { loadMentions, recordKey } = props;
	React.useEffect(() => {
		if (!loadMentions) {
			return undefined;
		}

		let cancelled = false;
		void (async () => {
			try {
				const mentions = await loadMentions();
				if (!cancelled) {
					// A display name two people share cannot be resolved from the text, and a link
					// to the wrong person is worse than none — so such a name gets no link.
					const ambiguous = new Set<string>();
					const resolved = new Map<string, string>();
					for (const mention of mentions) {
						const name = mention.name.trim();
						const known = resolved.get(name);
						if (known !== undefined && known !== mention.userId) {
							ambiguous.add(name);
						}
						resolved.set(name, mention.userId);
					}

					// Merged, not replaced: a mention picked while this was in flight stays.
					setKnownMentions((current) => {
						const next = new Map(current);
						for (const [name, userId] of resolved) {
							if (!ambiguous.has(name)) {
								next.set(name, userId);
							}
						}
						return next;
					});
				}
			} catch (error) {
				// Only the links are lost, and the text reads the same without them.
				console.warn(
					"[MentionControl] could not read the mentions of this record",
					error,
				);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [loadMentions, recordKey]);

	// The platform can push a new value at any time. Adopting it while the user is typing would
	// move the caret, so incoming values are only taken over when the component is not focused.
	React.useEffect(() => {
		if (!isFocused.current) {
			setText(value);
			// A business rule or a discarded form can take a mention out from under the editor.
			reanchor(value);
			reportWrittenRef.current();
		}
	}, [reanchor, value]);

	// Restores the caret after a mention was written into the text.
	React.useEffect(() => {
		const caret = pendingCaret.current;
		if (caret !== null && textareaRef.current) {
			textareaRef.current.setSelectionRange(caret, caret);
			pendingCaret.current = null;
		}
	});

	const query = props.notice === undefined ? (trigger?.query ?? null) : null;
	React.useEffect(() => {
		if (query === null) {
			setIsSearching(false);
			return undefined;
		}

		let cancelled = false;
		setIsSearching(true);
		const handle = setTimeout(() => {
			void (async () => {
				try {
					const result = await searchUsers(query);
					if (!cancelled) {
						setResults({ query, users: result.users, hasMore: result.hasMore });
						setActiveIndex(0);
						setHasLookupFailed(false);
						setMessage(undefined);
					}
				} catch (error) {
					if (!cancelled) {
						setResults({ query, users: [], hasMore: false });
						setHasLookupFailed(true);
						setMessage(strings.lookupFailed);
						console.error("[MentionControl] user lookup failed", error);
					}
				} finally {
					if (!cancelled) {
						setIsSearching(false);
					}
				}
			})();
		}, SEARCH_DEBOUNCE_MS);

		return () => {
			cancelled = true;
			clearTimeout(handle);
		};
	}, [query, searchUsers, strings.lookupFailed]);

	const closeSuggestions = React.useCallback(() => {
		setTrigger(null);
		setResults({ query: "", users: [], hasMore: false });
		setActiveIndex(0);
		setHasLookupFailed(false);
		setMessage(undefined);
	}, []);

	const commit = React.useCallback(
		(next: string) => {
			setText(next);
			onChange(next);
		},
		[onChange],
	);

	/**
	 * Keeps the open mention in step with the caret.
	 *
	 * `mayOpen` is false for plain caret moves. Letting a click or an arrow key open the list on
	 * text that is already there turns a perfectly ordinary Enter into an overwrite of an existing
	 * mention — and into a notification for whoever happened to be first in the list. Moving the
	 * caret can therefore only ever close the list; typing is what opens it.
	 */
	const { onWrittenMentionsChange } = props;
	const reportWrittenRef = React.useRef<() => void>(() => undefined);
	const reportWritten = React.useCallback(() => {
		onWrittenMentionsChange?.(insertedMentions.current.map((mention) => mention.userId));
	}, [onWrittenMentionsChange]);
	reportWrittenRef.current = reportWritten;

	const syncTrigger = React.useCallback(
		(nextText: string, caret: number, mayOpen: boolean) => {
			// Editing in front of a mention moves it, so the recorded ones are put back where they
			// now sit before they are consulted — otherwise the rule below silently stops applying
			// to them, and the picker reopens over a mention that is already finished.
			reanchor(nextText);
			reportWritten();
			const found = findMentionTrigger(nextText, caret);
			// A query may hold a space because names do, so continuing the sentence after a one-word
			// mention ("@Bob thanks") still looks like a query. It is not: the name is already there.
			// Only the mention that was written at that exact spot counts — a later "@Bob Schmidt"
			// typed somewhere else is a query like any other, and must still open the list.
			const continuesInsertedMention =
				found !== null &&
				insertedMentions.current.some(
					(mention) =>
						mention.start === found.start &&
						found.query.startsWith(`${mention.name} `),
				);
			const next = continuesInsertedMention ? null : found;
			setTrigger((current) => {
				if (current === null) {
					return mayOpen ? next : null;
				}
				if (next === null) {
					return null;
				}
				// A caret move may follow the mention it is already on, never jump to another one.
				// Landing inside a finished mention elsewhere in the text would re-aim the picker at
				// it, and the next Enter would overwrite that mention and notify the wrong person.
				if (!mayOpen && next.start !== current.start) {
					return null;
				}
				if (
					current.start === next.start &&
					current.end === next.end &&
					current.query === next.query
				) {
					return current;
				}
				return next;
			});
		},
		[reanchor, reportWritten],
	);

	const handleChange = React.useCallback(
		(
			event: React.ChangeEvent<HTMLTextAreaElement>,
			data: { value: string },
		) => {
			const caret = event.target.selectionStart ?? data.value.length;
			commit(data.value);
			syncTrigger(data.value, caret, true);
		},
		[commit, syncTrigger],
	);

	// React derives onSelect from its own heuristics, so the caret is read from the plain events
	// that always fire when it can move: releasing a key and clicking into the text.
	const handleCaretMove = React.useCallback(
		(event: React.SyntheticEvent<HTMLTextAreaElement>) => {
			const element = event.currentTarget;
			syncTrigger(
				element.value,
				element.selectionStart ?? element.value.length,
				false,
			);
		},
		[syncTrigger],
	);

	const select = React.useCallback(
		(user: UserSuggestion) => {
			if (!trigger) {
				return;
			}

			const result = applyMention(text, trigger, user.name);
			if (
				props.maxLength !== undefined &&
				result.text.length > props.maxLength
			) {
				// Closing clears any standing message, so the reason is set after it.
				closeSuggestions();
				setMessage(strings.mentionTooLong);
				return;
			}

			const written: InsertedMention = {
				start: trigger.start,
				name: user.name.trim(),
				userId: user.id,
			};
			setKnownMentions((current) =>
				current.get(written.name) === user.id
					? current
					: new Map(current).set(written.name, user.id),
			);
			const writtenEnd = written.start + written.name.length + 1;
			insertedMentions.current = [
				// The new mention takes the space the query stood in, so anything recorded there
				// speaks for a person the text no longer names.
				...reanchor(result.text).filter(
					(mention) =>
						mention.start + mention.name.length + 1 <= written.start ||
						mention.start >= writtenEnd,
				),
				written,
			];
			reportWritten();
			pendingCaret.current = result.caret;
			commit(result.text);
			closeSuggestions();
			setMessage(undefined);

			void (async () => {
				try {
					await onMention(user);
				} catch (error) {
					if (isMounted.current) {
						setMessage(strings.notificationFailed);
					}
					console.error("[MentionControl] notification failed", error);
				}
			})();
		},
		[
			closeSuggestions,
			commit,
			onMention,
			props.maxLength,
			reanchor,
			reportWritten,
			strings.mentionTooLong,
			strings.notificationFailed,
			text,
			trigger,
		],
	);

	const mentionSegments = React.useMemo(
		() => splitMentions(text, knownMentions, insertedMentions.current),
		[text, knownMentions],
	);

	const handleKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			// The Enter that commits an IME candidate must not pick a suggestion, and the keys an
			// IME is still working on are not deletions either.
			if (event.nativeEvent.isComposing) {
				return;
			}

			// A mention is deleted as a whole: the key is aimed at the whole name and the deleting
			// is left to the textarea. Doing it here instead would take the step out of the undo
			// history the field keeps, and Ctrl+Z would no longer bring the name back.
			//
			// This runs before the picker's keys, because it also has to work while no mention is
			// open — which is the normal state of a name that was picked a while ago.
			if (event.key === "Backspace" || event.key === "Delete") {
				const element = event.currentTarget;
				const caret = element.selectionStart ?? 0;
				// A selection already says what is to go; only a bare caret is ambiguous.
				const range =
					caret === element.selectionEnd
						? mentionDeletionRange(
								text,
								caret,
								event.key === "Backspace" ? "backward" : "forward",
								mentionSpans(mentionSegments),
							)
						: null;
				if (range) {
					element.setSelectionRange(range.start, range.end);
					return;
				}
			}

			if (!trigger) {
				return;
			}

			switch (event.key) {
				case "ArrowDown":
					if (suggestions.length > 0) {
						event.preventDefault();
						setActiveIndex((index) => (index + 1) % suggestions.length);
					}
					break;
				case "ArrowUp":
					if (suggestions.length > 0) {
						event.preventDefault();
						setActiveIndex(
							(index) => (index - 1 + suggestions.length) % suggestions.length,
						);
					}
					break;
				case "Enter":
				case "Tab": {
					const active = suggestions[activeIndex] as UserSuggestion | undefined;
					if (active) {
						event.preventDefault();
						select(active);
					}
					break;
				}
				case "Escape":
					event.preventDefault();
					closeSuggestions();
					break;
				default:
					break;
			}
		},
		[
			activeIndex,
			closeSuggestions,
			mentionSegments,
			select,
			suggestions,
			text,
			trigger,
		],
	);

	const isOpen =
		trigger !== null &&
		!props.disabled &&
		!hasLookupFailed &&
		props.notice === undefined;
	// Until the answer for the current query is in, the popup is a spinner, not the list.
	const isSuggestionListRendered = isOpen && suggestions.length > 0;
	const remaining =
		props.maxLength !== undefined ? props.maxLength - text.length : undefined;

	// Where the list has to be drawn, in viewport coordinates. It follows the textarea, and flips
	// above it when the space below would cut it off.
	const [listBox, setListBox] = React.useState<React.CSSProperties | undefined>(
		undefined,
	);
	React.useLayoutEffect(() => {
		if (!isOpen) {
			setListBox(undefined);
			return undefined;
		}

		const measure = () => {
			const element = textareaRef.current;
			if (!element) {
				return;
			}

			const box = element.getBoundingClientRect();
			const below = window.innerHeight - box.bottom;
			const width = Math.max(box.width, Math.min(300, window.innerWidth - 16));
			const left = Math.max(
				8,
				Math.min(box.left, window.innerWidth - width - 8),
			);

			setListBox(
				below < LIST_MAX_HEIGHT && box.top > below
					? { bottom: window.innerHeight - box.top + 2, left, width }
					: { top: box.bottom + 2, left, width },
			);
		};

		measure();
		window.addEventListener("resize", measure);
		// Capturing, because what scrolls is a container inside the form, not the window.
		window.addEventListener("scroll", measure, true);
		return () => {
			window.removeEventListener("resize", measure);
			window.removeEventListener("scroll", measure, true);
		};
	}, [isOpen, isSearching, suggestions.length]);

	if (props.masked) {
		return (
			<FluentProvider
				className={styles.provider}
				theme={props.theme ?? webLightTheme}
			>
				<Text className={styles.masked}>{strings.maskedValue}</Text>
			</FluentProvider>
		);
	}

	return (
		<FluentProvider
			className={styles.provider}
			theme={props.theme ?? webLightTheme}
		>
			<div className={styles.root}>
				<div className={styles.field}>
					<Textarea
						appearance="outline"
						className={styles.textarea}
						disabled={props.disabled}
						onBlur={() => {
							isFocused.current = false;
							setIsEditing(false);
							onEditingChange(false);
							closeSuggestions();
						}}
						onChange={handleChange}
						onFocus={() => {
							isFocused.current = true;
							setIsEditing(true);
							onEditingChange(true);
						}}
						onKeyDown={handleKeyDown}
						placeholder={strings.placeholder}
						resize="vertical"
						textarea={{
							// aria-autocomplete, aria-controls and aria-activedescendant are the
							// attributes a textbox may carry. role="combobox"/aria-expanded would
							// override the native multiline textbox role, so the open state is
							// announced through the live region below instead.
							"aria-activedescendant":
								isOpen && suggestions.length > 0
									? optionId(activeIndex)
									: undefined,
							"aria-autocomplete": "list",
							"aria-label": props.label,
							"aria-controls": isSuggestionListRendered
								? LISTBOX_ID
								: undefined,
							maxLength: props.maxLength,
							onClick: handleCaretMove,
							onKeyUp: handleCaretMove,
							ref: textareaRef,
						}}
						value={text}
					/>

					{isEditing ? null : (
						// Clicking anywhere but a link puts the focus into the textarea, which takes
						// this view away again.
						<div
							className={styles.reading}
							onMouseDown={(event) => {
								if (!(event.target as HTMLElement).closest("a, button")) {
									event.preventDefault();
									textareaRef.current?.focus();
								}
							}}
						>
							{text.length === 0 ? (
								<span className={styles.placeholder}>
									{strings.placeholder}
								</span>
							) : (
								mentionSegments.map((segment, index) =>
									segment.userId !== undefined && props.onOpenUser ? (
										<Link
											key={`${segment.text}-${index.toString()}`}
											onClick={(event) => {
												event.preventDefault();
												props.onOpenUser?.(segment.userId ?? "");
											}}
										>
											{segment.text}
										</Link>
									) : (
										<React.Fragment key={`${segment.text}-${index.toString()}`}>
											{segment.text}
										</React.Fragment>
									),
								)
							)}
						</div>
					)}
				</div>

				<div aria-live="polite" className={styles.srOnly} role="status">
					{isOpen && !isSearching
						? strings.suggestionCount(props.formatNumber(suggestions.length))
						: ""}
				</div>

				{isOpen && listBox ? (
					<Portal>
						<div className={styles.popup} style={listBox}>
							{isSearching && suggestions.length === 0 ? (
								<Spinner
									label={strings.searching}
									labelPosition="after"
									size="tiny"
								/>
							) : (
								<SuggestionList
									activeIndex={activeIndex}
									emptyLabel={strings.noResults}
									id={LISTBOX_ID}
									moreLabel={hasMoreResults ? strings.moreResults : undefined}
									onHover={setActiveIndex}
									onSelect={select}
									optionId={optionId}
									suggestions={suggestions}
								/>
							)}
						</div>
					</Portal>
				) : null}

				<div className={styles.footer}>
					{props.notice ? (
						<MessageBar intent="info" politeness="polite">
							<MessageBarBody>{props.notice}</MessageBarBody>
						</MessageBar>
					) : null}
					{message ? (
						<MessageBar intent="warning" politeness="polite">
							<MessageBarBody>{message}</MessageBarBody>
						</MessageBar>
					) : null}
					{remaining !== undefined ? (
						<Text className={styles.counter} size={200}>
							{strings.charactersLeft(props.formatNumber(remaining))}
						</Text>
					) : null}
				</div>
			</div>
		</FluentProvider>
	);
};
