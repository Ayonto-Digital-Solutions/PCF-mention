import * as React from "react";
import {
	FluentProvider,
	MessageBar,
	MessageBarBody,
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
import type { UserSearchResult, UserSuggestion } from "../services/UserSearchService";
import { applyMention, findMentionTrigger, type MentionTrigger } from "../utils/mentionText";

/** Delay before an "@" query is sent to Dataverse, so typing does not cause one call per keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

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
}

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		position: "relative",
		rowGap: tokens.spacingVerticalXS,
		width: "100%",
	},
	textarea: {
		width: "100%",
	},
	popup: {
		insetInlineStart: 0,
		insetInlineEnd: 0,
		position: "absolute",
		top: "100%",
		zIndex: 1000,
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
const optionId = (index: number): string => `${LISTBOX_ID}-option-${index.toString()}`;

export const MentionEditor: React.FC<MentionEditorProps> = (props) => {
	const styles = useStyles();
	const { value, onChange, onEditingChange, onMention, searchUsers, strings } = props;

	const [text, setText] = React.useState(value);
	const [trigger, setTrigger] = React.useState<MentionTrigger | null>(null);
	const [suggestions, setSuggestions] = React.useState<readonly UserSuggestion[]>([]);
	const [hasMoreResults, setHasMoreResults] = React.useState(false);
	const [activeIndex, setActiveIndex] = React.useState(0);
	const [isSearching, setIsSearching] = React.useState(false);
	const [hasLookupFailed, setHasLookupFailed] = React.useState(false);
	const [message, setMessage] = React.useState<string | undefined>(undefined);

	const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
	/** Names this editor already wrote, so typing on past one does not look like a new query. */
	const insertedNames = React.useRef(new Set<string>());
	const isFocused = React.useRef(false);
	const pendingCaret = React.useRef<number | null>(null);

	// The platform can push a new value at any time. Adopting it while the user is typing would
	// move the caret, so incoming values are only taken over when the component is not focused.
	React.useEffect(() => {
		if (!isFocused.current) {
			setText(value);
		}
	}, [value]);

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
			setSuggestions([]);
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
						setSuggestions(result.users);
						setHasMoreResults(result.hasMore);
						setActiveIndex(0);
						setHasLookupFailed(false);
						setMessage(undefined);
					}
				} catch (error) {
					if (!cancelled) {
						setSuggestions([]);
						setHasMoreResults(false);
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
		setSuggestions([]);
		setHasMoreResults(false);
		setActiveIndex(0);
		setHasLookupFailed(false);
		setMessage(undefined);
	}, []);

	const commit = React.useCallback(
		(next: string) => {
			setText(next);
			onChange(next);
		},
		[onChange]
	);

	/**
	 * Keeps the open mention in step with the caret.
	 *
	 * `mayOpen` is false for plain caret moves. Letting a click or an arrow key open the list on
	 * text that is already there turns a perfectly ordinary Enter into an overwrite of an existing
	 * mention — and into a notification for whoever happened to be first in the list. Moving the
	 * caret can therefore only ever close the list; typing is what opens it.
	 */
	const syncTrigger = React.useCallback((nextText: string, caret: number, mayOpen: boolean) => {
		const found = findMentionTrigger(nextText, caret);
		// A query may hold a space because names do, so continuing the sentence after a one-word
		// mention ("@Bob thanks") still looks like a query. It is not: the name is already there.
		const next =
			found && [...insertedNames.current].some((name) => found.query.startsWith(`${name} `))
				? null
				: found;
		setTrigger((current) => {
			if (current === null) {
				return mayOpen ? next : null;
			}
			if (next === null) {
				return null;
			}
			if (current.start === next.start && current.end === next.end && current.query === next.query) {
				return current;
			}
			return next;
		});
	}, []);

	const handleChange = React.useCallback(
		(event: React.ChangeEvent<HTMLTextAreaElement>, data: { value: string }) => {
			const caret = event.target.selectionStart ?? data.value.length;
			commit(data.value);
			syncTrigger(data.value, caret, true);
		},
		[commit, syncTrigger]
	);

	// React derives onSelect from its own heuristics, so the caret is read from the plain events
	// that always fire when it can move: releasing a key and clicking into the text.
	const handleCaretMove = React.useCallback(
		(event: React.SyntheticEvent<HTMLTextAreaElement>) => {
			const element = event.currentTarget;
			syncTrigger(element.value, element.selectionStart ?? element.value.length, false);
		},
		[syncTrigger]
	);

	const select = React.useCallback(
		(user: UserSuggestion) => {
			if (!trigger) {
				return;
			}

			const result = applyMention(text, trigger, user.name);
			if (props.maxLength !== undefined && result.text.length > props.maxLength) {
				// Closing clears any standing message, so the reason is set after it.
				closeSuggestions();
				setMessage(strings.mentionTooLong);
				return;
			}

			insertedNames.current.add(user.name.trim());
			pendingCaret.current = result.caret;
			commit(result.text);
			closeSuggestions();
			setMessage(undefined);

			void (async () => {
				try {
					await onMention(user);
				} catch (error) {
					setMessage(strings.notificationFailed);
					console.error("[MentionControl] notification failed", error);
				}
			})();
		},
		[closeSuggestions, commit, onMention, props.maxLength, strings.mentionTooLong, strings.notificationFailed, text, trigger]
	);

	const handleKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			// The Enter that commits an IME candidate must not pick a suggestion.
			if (!trigger || event.nativeEvent.isComposing) {
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
						setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
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
		[activeIndex, closeSuggestions, select, suggestions, trigger]
	);

	const isOpen = trigger !== null && !props.disabled && !hasLookupFailed && props.notice === undefined;
	// While the first result is still on its way the popup is a spinner, not the list.
	const isSuggestionListRendered = isOpen && !(isSearching && suggestions.length === 0);
	const remaining = props.maxLength !== undefined ? props.maxLength - text.length : undefined;

	if (props.masked) {
		return (
			<FluentProvider theme={props.theme ?? webLightTheme}>
				<Text className={styles.masked}>{strings.maskedValue}</Text>
			</FluentProvider>
		);
	}

	return (
		<FluentProvider theme={props.theme ?? webLightTheme}>
			<div className={styles.root}>
				<Textarea
					appearance="outline"
					className={styles.textarea}
					disabled={props.disabled}
					onBlur={() => {
						isFocused.current = false;
						onEditingChange(false);
						closeSuggestions();
					}}
					onChange={handleChange}
					onFocus={() => {
						isFocused.current = true;
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
						"aria-activedescendant": isOpen && suggestions.length > 0 ? optionId(activeIndex) : undefined,
						"aria-autocomplete": "list",
						"aria-label": props.label,
						"aria-controls": isSuggestionListRendered ? LISTBOX_ID : undefined,
						maxLength: props.maxLength,
						onClick: handleCaretMove,
						onKeyUp: handleCaretMove,
						ref: textareaRef,
					}}
					value={text}
				/>

				<div aria-live="polite" className={styles.srOnly} role="status">
					{isOpen && !isSearching ? strings.suggestionCount(props.formatNumber(suggestions.length)) : ""}
				</div>

				{isOpen ? (
					<div className={styles.popup}>
						{isSearching && suggestions.length === 0 ? (
							<Spinner label={strings.searching} labelPosition="after" size="tiny" />
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
