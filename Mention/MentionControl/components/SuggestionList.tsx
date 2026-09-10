import * as React from "react";
import { Avatar, Text, makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import type { UserSuggestion } from "../services/UserSearchService";

export interface SuggestionListProps {
	readonly id: string;
	readonly suggestions: readonly UserSuggestion[];
	readonly activeIndex: number;
	readonly optionId: (index: number) => string;
	readonly onSelect: (user: UserSuggestion) => void;
	readonly onHover: (index: number) => void;
	readonly emptyLabel: string;
	/** Shown when the server had more matches than fit in the list. */
	readonly moreLabel?: string;
}

const useStyles = makeStyles({
	list: {
		...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
		...shorthands.borderRadius(tokens.borderRadiusMedium),
		backgroundColor: tokens.colorNeutralBackground1,
		boxShadow: tokens.shadow16,
		listStyleType: "none",
		marginBlock: tokens.spacingVerticalXXS,
		maxHeight: "260px",
		overflowY: "auto",
		paddingInlineStart: 0,
		paddingBlock: tokens.spacingVerticalXXS,
	},
	option: {
		alignItems: "center",
		columnGap: tokens.spacingHorizontalS,
		cursor: "pointer",
		display: "flex",
		paddingBlock: tokens.spacingVerticalXS,
		paddingInline: tokens.spacingHorizontalS,
	},
	optionActive: {
		backgroundColor: tokens.colorNeutralBackground1Hover,
	},
	optionText: {
		display: "flex",
		flexDirection: "column",
		minWidth: 0,
	},
	secondary: {
		color: tokens.colorNeutralForeground3,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	empty: {
		color: tokens.colorNeutralForeground3,
		display: "block",
		paddingBlock: tokens.spacingVerticalXS,
		paddingInline: tokens.spacingHorizontalS,
	},
	more: {
		color: tokens.colorNeutralForeground3,
		display: "block",
		...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke2),
		marginBlockStart: tokens.spacingVerticalXXS,
		paddingBlock: tokens.spacingVerticalXS,
		paddingInline: tokens.spacingHorizontalS,
	},
});

export const SuggestionList: React.FC<SuggestionListProps> = (props) => {
	const styles = useStyles();

	if (props.suggestions.length === 0) {
		return (
			<div className={styles.list} id={props.id} role="status">
				<Text className={styles.empty} size={200}>
					{props.emptyLabel}
				</Text>
			</div>
		);
	}

	return (
		<ul className={styles.list} id={props.id} role="listbox">
			{props.suggestions.map((user, index) => (
				<li
					aria-selected={index === props.activeIndex}
					className={mergeClasses(styles.option, index === props.activeIndex && styles.optionActive)}
					id={props.optionId(index)}
					key={user.id}
					// The textarea keeps the focus, so the option is picked on mouse down
					// before the browser can move the focus away from it.
					onMouseDown={(event) => {
						event.preventDefault();
						props.onSelect(user);
					}}
					onMouseEnter={() => {
						props.onHover(index);
					}}
					role="option"
				>
					<Avatar color="colorful" name={user.name} size={28} />
					<span className={styles.optionText}>
						<Text size={300} truncate wrap={false}>
							{user.name}
						</Text>
						{user.jobTitle ? (
							<Text className={styles.secondary} size={200}>
								{user.jobTitle}
							</Text>
						) : null}
					</span>
				</li>
			))}
			{props.moreLabel ? (
				// Not an option: it is a note about the result set, not something to pick.
				<li aria-hidden="true">
					<Text className={styles.more} size={200}>
						{props.moreLabel}
					</Text>
				</li>
			) : null}
		</ul>
	);
};
