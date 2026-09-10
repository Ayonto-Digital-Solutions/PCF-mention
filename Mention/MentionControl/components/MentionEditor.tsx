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
import type { UserSuggestion } from "../services/UserSearchService";
import { applyMention, findMentionTrigger, type MentionTrigger } from "../utils/mentionText";

/** Delay before an "@" query is sent to Dataverse, so typing does not cause one call per keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

export interface MentionEditorStrings {
	readonly placeholder: string;
	readonly noResults: string;
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
	readonly theme?: Theme;
	readonly strings: MentionEditorStrings;
	readonly formatNumber: (value: number) => string;
	readonly searchUsers: (term: string) => Promise<UserSuggestion[]>;
	readonly onChange: (value: string) => void;
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
	const { value, onChange, onMention, searchUsers, strings } = props;

	const [text, setText] = React.useState(value);
	const [trigger, setTrigger] = React.useState<MentionTrigger | null>(null);
	const [suggestions, setSuggestions] = React.useState<readonly UserSuggestion[]>([]);
	const [activeIndex, setActiveIndex] = React.useState(0);
	const [isSearching, setIsSearching] = React.useState(false);
	const [hasLookupFailed, setHasLookupFailed] = React.useState(false);
	const [message, setMessage] = React.useState<string | undefined>(undefined);

	const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
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

	const query = trigger?.query ?? null;
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
					const users = await searchUsers(query);
					if (!cancelled) {
						setSuggestions(users);
						setActiveIndex(0);
						setHasLookupFailed(false);
						setMessage(undefined);
					}
				} catch (error) {
					if (!cancelled) {
						setSuggestions([]);
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
		setActiveIndex(0);
		setHasLookupFailed(false);
	}, []);

	const commit = React.useCallback(
		(next: string) => {
			setText(next);
			onChange(next);
		},
		[onChange]
	);

	// Keeps the open mention in step with the caret. Called for edits and for plain caret moves,
	// because a click or an arrow key can carry the caret out of the mention that opened the list.
	const syncTrigger = React.useCallback((nextText: string, caret: number) => {
		const next = findMentionTrigger(nextText, caret);
		setTrigger((current) => {
			if (current === null && next === null) {
				return current;
			}
			if (current && next && current.start === next.start && current.end === next.end) {
				return current;
			}
			return next;
		});
	}, []);

	const handleChange = React.useCallback(
		(event: React.ChangeEvent<HTMLTextAreaElement>, data: { value: string }) => {
			const caret = event.target.selectionStart ?? data.value.length;
			commit(data.value);
			syncTrigger(data.value, caret);
		},
		[commit, syncTrigger]
	);

	// React derives onSelect from its own heuristics, so the caret is read from the plain events
	// that always fire when it can move: releasing a key and clicking into the text.
	const handleCaretMove = React.useCallback(
		(event: React.SyntheticEvent<HTMLTextAreaElement>) => {
			const element = event.currentTarget;
			syncTrigger(element.value, element.selectionStart ?? element.value.length);
		},
		[syncTrigger]
	);

	const select = React.useCallback(
		(user: UserSuggestion) => {
			if (!trigger) {
				return;
			}

			const result = applyMention(text, trigger, user.name);
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
		[closeSuggestions, commit, onMention, strings.notificationFailed, text, trigger]
	);

	const handleKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

	const isOpen = trigger !== null && !props.disabled && !hasLookupFailed;
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
						closeSuggestions();
					}}
					onChange={handleChange}
					onFocus={() => {
						isFocused.current = true;
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
						"aria-controls": isOpen ? LISTBOX_ID : undefined,
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
								onHover={setActiveIndex}
								onSelect={select}
								optionId={optionId}
								suggestions={suggestions}
							/>
						)}
					</div>
				) : null}

				<div className={styles.footer}>
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
