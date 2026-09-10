import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MentionEditor, type MentionEditorProps, type MentionEditorStrings } from "../MentionControl/components/MentionEditor";
import type { UserSuggestion } from "../MentionControl/services/UserSearchService";

const USERS: UserSuggestion[] = [
	{ id: "u1", name: "Anna Berger", jobTitle: "Sales Manager" },
	{ id: "u2", name: "Andreas Klein", jobTitle: "Consultant" },
];

const STRINGS: MentionEditorStrings = {
	placeholder: "Type @ to mention someone",
	noResults: "No users found",
	searching: "Searching users",
	suggestionCount: (count) => `${count} suggestions available`,
	charactersLeft: (remaining) => `${remaining} characters left`,
	notificationFailed: "The notification could not be sent.",
	lookupFailed: "Users could not be loaded.",
	maskedValue: "* * * * *",
};

function setup(overrides: Partial<MentionEditorProps> = {}) {
	const onChange = vi.fn();
	const onMention = vi.fn().mockResolvedValue(undefined);
	const searchUsers = vi.fn().mockResolvedValue(USERS);

	const props: MentionEditorProps = {
		value: "",
		disabled: false,
		masked: false,
		strings: STRINGS,
		formatNumber: (value) => String(value),
		searchUsers,
		onChange,
		onMention,
		...overrides,
	};

	const utils = render(<MentionEditor {...props} />);
	const textarea = utils.container.querySelector("textarea");
	if (!textarea && !props.masked) {
		throw new Error("textarea was not rendered");
	}
	return { ...utils, textarea: textarea as HTMLTextAreaElement, onChange, onMention, searchUsers };
}

/** Types into the textarea and reports the caret, the way the browser would. */
function type(textarea: HTMLTextAreaElement, value: string, caret = value.length) {
	fireEvent.change(textarea, { target: { value, selectionStart: caret, selectionEnd: caret } });
}

afterEach(cleanup);

describe("MentionEditor", () => {
	it("reports every edit to the host", () => {
		const { textarea, onChange } = setup();
		type(textarea, "hello");
		expect(onChange).toHaveBeenCalledWith("hello");
	});

	it("does not query for users while no mention is open", () => {
		const { textarea, searchUsers } = setup();
		type(textarea, "hello");
		expect(searchUsers).not.toHaveBeenCalled();
	});

	it("queries for users once an @ is typed and lists them", async () => {
		const { textarea, searchUsers } = setup();
		type(textarea, "hi @An");

		await waitFor(() => {
			expect(searchUsers).toHaveBeenCalledWith("An");
		});
		await waitFor(() => {
			expect(screen.getByRole("option", { name: /Anna Berger/ })).toBeTruthy();
		});
		expect(screen.getAllByRole("option")).toHaveLength(2);
		expect(textarea.getAttribute("aria-controls")).toBe("ayonto-mention-suggestions");
	});

	it("moves the active option with the arrow keys and marks it for screen readers", async () => {
		const { textarea } = setup();
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		expect(screen.getAllByRole("option")[0].getAttribute("aria-selected")).toBe("true");

		fireEvent.keyDown(textarea, { key: "ArrowDown" });
		expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
		expect(textarea.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1].id);

		// Wraps around at the end of the list.
		fireEvent.keyDown(textarea, { key: "ArrowDown" });
		expect(screen.getAllByRole("option")[0].getAttribute("aria-selected")).toBe("true");

		fireEvent.keyDown(textarea, { key: "ArrowUp" });
		expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
	});

	it("writes the picked user into the text and notifies the host", async () => {
		const { textarea, onChange, onMention } = setup();
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(onChange).toHaveBeenLastCalledWith("hi @Anna Berger ");
		expect(onMention).toHaveBeenCalledWith(USERS[0]);
		expect(screen.queryByRole("option")).toBeNull();
	});

	it("picks the highlighted user, not always the first one", async () => {
		const { textarea, onChange, onMention } = setup();
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		fireEvent.keyDown(textarea, { key: "ArrowDown" });
		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(onChange).toHaveBeenLastCalledWith("hi @Andreas Klein ");
		expect(onMention).toHaveBeenCalledWith(USERS[1]);
	});

	it("picks a user on click", async () => {
		const { textarea, onMention } = setup();
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		fireEvent.mouseDown(screen.getAllByRole("option")[1]);
		expect(onMention).toHaveBeenCalledWith(USERS[1]);
	});

	it("closes the list when the caret leaves the mention", async () => {
		const { textarea } = setup();
		type(textarea, "hi @An and more", 6);
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		// The user clicks to the end of the line; the caret is no longer inside the mention.
		textarea.selectionStart = 15;
		textarea.selectionEnd = 15;
		fireEvent.click(textarea);

		await waitFor(() => {
			expect(screen.queryAllByRole("option")).toHaveLength(0);
		});
		expect(textarea.getAttribute("aria-controls")).toBeNull();
	});

	it("reopens the list when the caret moves back into a mention", async () => {
		const { textarea } = setup();
		type(textarea, "hi @An and more", 15);
		expect(screen.queryByRole("option")).toBeNull();

		textarea.selectionStart = 6;
		textarea.selectionEnd = 6;
		fireEvent.keyUp(textarea, { key: "ArrowLeft" });

		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
	});

	it("closes the list on Escape without changing the text", async () => {
		const { textarea, onChange } = setup();
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
		const callsBefore = onChange.mock.calls.length;

		fireEvent.keyDown(textarea, { key: "Escape" });

		expect(screen.queryByRole("option")).toBeNull();
		expect(onChange.mock.calls).toHaveLength(callsBefore);
	});

	it("reports an empty result instead of an empty list", async () => {
		const { textarea } = setup({ searchUsers: vi.fn().mockResolvedValue([]) });
		type(textarea, "hi @Zz");

		await waitFor(() => {
			expect(screen.getByText("No users found")).toBeTruthy();
		});
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("shows the failure instead of claiming that no user matched", async () => {
		const { textarea } = setup({ searchUsers: vi.fn().mockRejectedValue(new Error("boom")) });
		type(textarea, "hi @An");

		await waitFor(() => {
			expect(screen.getByText("Users could not be loaded.")).toBeTruthy();
		});
		expect(screen.queryByText("No users found")).toBeNull();
	});

	it("surfaces a failed notification without losing the mention", async () => {
		const onMention = vi.fn().mockRejectedValue(new Error("smtp down"));
		const { textarea, onChange } = setup({ onMention });
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(onChange).toHaveBeenLastCalledWith("hi @Anna Berger ");
		await waitFor(() => {
			expect(screen.getByText("The notification could not be sent.")).toBeTruthy();
		});
	});

	it("shows the remaining characters when the column has a limit", () => {
		setup({ value: "abc", maxLength: 100 });
		expect(screen.getByText("97 characters left")).toBeTruthy();
	});

	it("hides the value when the column is masked by column security", () => {
		const { container } = setup({ masked: true, value: "secret" });
		expect(container.querySelector("textarea")).toBeNull();
		expect(screen.getByText("* * * * *")).toBeTruthy();
	});

	it("does not open the list when the control is read-only", async () => {
		const { textarea, searchUsers } = setup({ disabled: true });
		type(textarea, "hi @An");
		await waitFor(() => expect(searchUsers).toHaveBeenCalled());
		expect(screen.queryByRole("option")).toBeNull();
	});
});
