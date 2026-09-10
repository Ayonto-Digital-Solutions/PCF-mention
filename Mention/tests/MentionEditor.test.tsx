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
	mentionTooLong: "The mention does not fit in the remaining characters.",
	moreResults: "More matches — narrow your search",
	searching: "Searching users",
	suggestionCount: (count) => `${count} suggestions available`,
	charactersLeft: (remaining) => `${remaining} characters left`,
	notificationFailed: "The notification could not be sent.",
	lookupFailed: "Users could not be loaded.",
	maskedValue: "* * * * *",
};

function setup(overrides: Partial<MentionEditorProps> = {}) {
	const onChange = vi.fn();
	const onEditingChange = vi.fn();
	const onMention = vi.fn().mockResolvedValue(undefined);
	const searchUsers = vi.fn().mockResolvedValue({ users: USERS, hasMore: false });

	const props: MentionEditorProps = {
		value: "",
		disabled: false,
		masked: false,
		strings: STRINGS,
		formatNumber: (value) => String(value),
		searchUsers,
		onChange,
		onEditingChange,
		onMention,
		...overrides,
	};

	lastProps = props;
	const utils = render(<MentionEditor {...props} />);
	const textarea = utils.container.querySelector("textarea");
	if (!textarea && !props.masked) {
		throw new Error("textarea was not rendered");
	}
	return {
		...utils,
		textarea: textarea!,
		onChange,
		onEditingChange,
		onMention,
		searchUsers,
	};
}

/** Types into the textarea and reports the caret, the way the browser would. */
function type(textarea: HTMLTextAreaElement, value: string, caret = value.length) {
	fireEvent.change(textarea, { target: { value, selectionStart: caret, selectionEnd: caret } });
}

let lastProps: MentionEditorProps | undefined;

afterEach(cleanup);

describe("MentionEditor", () => {
	it("reports every edit to the host", () => {
		const { textarea, onChange } = setup();
		type(textarea, "hello");
		expect(onChange).toHaveBeenCalledWith("hello");
	});

	it("does not query for users while no mention is open", async () => {
		const { textarea, searchUsers } = setup();
		type(textarea, "hello");

		// The lookup is debounced, so the assertion has to outlast the debounce to mean anything.
		await new Promise((resolve) => setTimeout(resolve, 400));
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
		const options = screen.getAllByRole("option");
		expect(options[1].getAttribute("aria-selected")).toBe("true");
		// Distinct ids, or pointing at one of them would say nothing.
		expect(options[0].id).not.toBe(options[1].id);
		expect(textarea.getAttribute("aria-activedescendant")).toBe(options[1].id);

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

	it("does not open the list when the caret merely moves into existing text", async () => {
		// A saved note already contains a mention. Clicking behind it must not arm the picker:
		// the next Enter would overwrite the mention and notify whoever is first in the list.
		const { textarea, searchUsers } = setup({ value: "agreed with @Bob" });
		textarea.selectionStart = 16;
		textarea.selectionEnd = 16;
		fireEvent.click(textarea);

		await waitFor(() => expect(searchUsers).not.toHaveBeenCalled());
		expect(screen.queryAllByRole("option")).toHaveLength(0);
		expect(textarea.getAttribute("aria-controls")).toBeNull();
	});

	it("does not let Enter pick a match that answered an earlier query", async () => {
		// Between the debounce and the round trip the previous query's results are still in hand;
		// committing them would insert someone the user is no longer looking at.
		let resolveSecond: ((value: { users: typeof USERS; hasMore: boolean }) => void) | undefined;
		const searchUsers = vi
			.fn()
			.mockResolvedValueOnce({ users: [USERS[0]], hasMore: false })
			.mockImplementationOnce(
				() => new Promise((resolve) => { resolveSecond = resolve; })
			);

		const { textarea, onMention } = setup({ searchUsers });
		type(textarea, "cc @Bo");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));

		// The user finishes the word; the answer for it is still outstanding.
		type(textarea, "cc @Bob");
		await waitFor(() => expect(searchUsers).toHaveBeenCalledTimes(2));

		// The earlier query's match must not be on offer any more.
		expect(screen.queryAllByRole("option")).toHaveLength(0);
		fireEvent.keyDown(textarea, { key: "Enter" });
		expect(onMention).not.toHaveBeenCalled();

		// Once the answer for the current query lands, the list comes back.
		resolveSecond?.({ users: USERS, hasMore: false });
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
	});

	it("closes rather than re-aiming when the caret lands on a different mention", async () => {
		// With the picker open on a fresh query, clicking inside a finished mention earlier in the
		// text used to re-anchor the trigger there — and the next Enter overwrote that mention and
		// notified whoever the new query matched.
		const { textarea, onChange, onMention, searchUsers } = setup({ value: "hi @Andreas Klein and " });
		type(textarea, "hi @Andreas Klein and @ne", 25);
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
		searchUsers.mockClear();

		textarea.selectionStart = 6;
		textarea.selectionEnd = 6;
		fireEvent.click(textarea);

		// Long enough for a re-aimed query to be sent and answered: an empty list right after the
		// click only means the answer is outstanding, which every closed *and* every open picker
		// looks like for 250 ms.
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(searchUsers).not.toHaveBeenCalled();
		expect(screen.queryAllByRole("option")).toHaveLength(0);

		const callsBefore = onChange.mock.calls.length;
		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(onChange.mock.calls).toHaveLength(callsBefore);
		expect(onMention).not.toHaveBeenCalled();
	});

	it("still narrows the mention it is already on when the caret moves inside it", async () => {
		const { textarea, searchUsers } = setup();
		type(textarea, "hi @Ann");
		await waitFor(() => expect(searchUsers).toHaveBeenCalledWith("Ann"));

		// ArrowLeft inside the same mention shortens the query rather than closing the list.
		textarea.selectionStart = 6;
		textarea.selectionEnd = 6;
		fireEvent.keyUp(textarea, { key: "ArrowLeft" });

		await waitFor(() => expect(searchUsers).toHaveBeenCalledWith("An"));
		expect(screen.getAllByRole("option")).toHaveLength(2);
	});

	it("stays closed after Escape even when the caret moves inside the mention", async () => {
		const { textarea } = setup();
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		fireEvent.keyDown(textarea, { key: "Escape" });
		textarea.selectionStart = 5;
		textarea.selectionEnd = 5;
		fireEvent.keyUp(textarea, { key: "ArrowLeft" });

		expect(screen.queryAllByRole("option")).toHaveLength(0);
	});

	it("re-runs the search when the query is replaced without moving the caret", async () => {
		const { textarea, searchUsers } = setup();
		type(textarea, "hi @ab");
		await waitFor(() => expect(searchUsers).toHaveBeenCalledWith("ab"));

		// Same caret position, different query — a paste over a selection.
		type(textarea, "hi @cd");
		await waitFor(() => expect(searchUsers).toHaveBeenCalledWith("cd"));
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
		const { textarea } = setup({ searchUsers: vi.fn().mockResolvedValue({ users: [], hasMore: false }) });
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

	it("tells the host when the editor is being used, so the value is not rolled back", () => {
		const { textarea, onEditingChange } = setup();

		fireEvent.focus(textarea);
		expect(onEditingChange).toHaveBeenLastCalledWith(true);

		fireEvent.blur(textarea);
		expect(onEditingChange).toHaveBeenLastCalledWith(false);
	});

	it("keeps the typed text when the host sends a different value mid-edit", () => {
		const { textarea, rerender, container } = setup({ value: "start" });
		fireEvent.focus(textarea);
		type(textarea, "start typed");

		// A different value, so the sync effect really runs — and must still not win.
		rerender(<MentionEditor {...lastProps!} value="written elsewhere" />);

		expect(container.querySelector("textarea")!.value).toBe("start typed");
	});

	it("takes over a new host value once the editor is no longer focused", () => {
		const { textarea, rerender, container } = setup({ value: "old" });
		fireEvent.focus(textarea);
		fireEvent.blur(textarea);

		rerender(<MentionEditor {...lastProps!} value="from the platform" />);

		expect(container.querySelector("textarea")!.value).toBe("from the platform");
	});

	it("says so when the server had more matches than fit in the list", async () => {
		const { textarea } = setup({
			searchUsers: vi.fn().mockResolvedValue({ users: USERS, hasMore: true }),
		});
		type(textarea, "hi @An");

		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
		expect(screen.getByText("More matches — narrow your search")).toBeTruthy();
	});

	it("does not mention truncation when the whole result is shown", async () => {
		const { textarea } = setup();
		type(textarea, "hi @An");

		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
		expect(screen.queryByText("More matches — narrow your search")).toBeNull();
	});

	it("keeps the picker closed and explains why when mentioning is unavailable", async () => {
		const { textarea, searchUsers } = setup({ notice: "Save the record first." });
		type(textarea, "hi @An");

		expect(screen.getByText("Save the record first.")).toBeTruthy();
		// Not even a round trip: the list it would fill cannot open.
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(searchUsers).not.toHaveBeenCalled();
		expect(screen.queryAllByRole("option")).toHaveLength(0);
		expect(textarea.getAttribute("aria-controls")).toBeNull();
	});

	it("still lets the user type while mentioning is unavailable", () => {
		const { textarea, onChange } = setup({ notice: "No connection." });
		type(textarea, "still editable");

		expect(onChange).toHaveBeenCalledWith("still editable");
	});

	it("refuses a mention that would overflow the column instead of writing past its limit", async () => {
		const { textarea, onChange, onMention } = setup({ maxLength: 20 });
		type(textarea, "0123456789012 @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
		const callsBefore = onChange.mock.calls.length;

		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(onChange.mock.calls).toHaveLength(callsBefore);
		expect(onMention).not.toHaveBeenCalled();
		expect(screen.getByText("The mention does not fit in the remaining characters.")).toBeTruthy();
	});

	it("names the textarea with the column label", () => {
		const { textarea } = setup({ label: "Internal note" });
		expect(textarea.getAttribute("aria-label")).toBe("Internal note");
	});

	it("clears a stale lookup warning once the mention is closed", async () => {
		const { textarea } = setup({ searchUsers: vi.fn().mockRejectedValue(new Error("boom")) });
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getByText("Users could not be loaded.")).toBeTruthy());

		fireEvent.keyDown(textarea, { key: "Escape" });

		expect(screen.queryByText("Users could not be loaded.")).toBeNull();
	});

	it("does not query again when the sentence continues after a finished mention", async () => {
		// "@Bob thanks" still parses as a query because names hold a space, but the name is
		// already written — searching for it again is a wasted round trip and a stray popup.
		const { textarea, searchUsers } = setup();
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
		fireEvent.keyDown(textarea, { key: "Enter" });
		searchUsers.mockClear();

		type(textarea, "hi @Anna Berger thanks");

		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(searchUsers).not.toHaveBeenCalled();
		expect(screen.queryAllByRole("option")).toHaveLength(0);
	});

	it("does not query again when the sentence continues after a one-word mention", async () => {
		const searchUsers = vi.fn().mockResolvedValue({ users: [{ id: "u3", name: "Bob" }], hasMore: false });
		const { textarea } = setup({ searchUsers });
		type(textarea, "hi @Bo");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
		fireEvent.keyDown(textarea, { key: "Enter" });
		searchUsers.mockClear();

		type(textarea, "hi @Bob thanks");

		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(searchUsers).not.toHaveBeenCalled();
	});

	it("still opens the list for a new mention that starts with a name already written", async () => {
		// The sentence carrying on after "@Bob" is not a query, but "@Bob Schmidt" typed further
		// along is one — for somebody else, whose name simply starts the same way.
		const searchUsers = vi.fn().mockResolvedValue({ users: [{ id: "u3", name: "Bob" }], hasMore: false });
		const { textarea } = setup({ searchUsers });
		type(textarea, "hi @Bo");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
		fireEvent.keyDown(textarea, { key: "Enter" });
		searchUsers.mockClear();

		type(textarea, "hi @Bob cc @Bob Schmidt");

		await waitFor(() => expect(searchUsers).toHaveBeenCalledWith("Bob Schmidt"));
	});

	it("keeps a finished mention safe after the text in front of it changed", async () => {
		// The guard is positional, so every edit before a mention has to move it along. Left
		// behind, it stops covering that mention: the picker reopens over it and the next Enter
		// overwrites the mention and notifies whoever happens to be first in the list.
		const searchUsers = vi.fn().mockResolvedValue({ users: [{ id: "u3", name: "Bob" }], hasMore: false });
		const { textarea } = setup({ searchUsers });
		type(textarea, "hi @Bo");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
		fireEvent.keyDown(textarea, { key: "Enter" });
		searchUsers.mockClear();

		// Six characters typed in front of the mention, then the sentence carried on behind it.
		type(textarea, "hi there @Bob ", 8);
		type(textarea, "hi there @Bob t");

		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(searchUsers).not.toHaveBeenCalled();
		expect(screen.queryAllByRole("option")).toHaveLength(0);
	});

	it("keeps the namesake who is still in the text, not the one that was deleted", async () => {
		// Two people are called the same and both are mentioned. Deleting the first mention leaves
		// a text that reads exactly like deleting the second one, so looking the name up again
		// handed the surviving mention to the person who had just been taken out — and it was
		// their notification that went out instead of the other one's.
		const namesakes: UserSuggestion[] = [
			{ id: "n1", name: "Thomas Müller", jobTitle: "Betrieb" },
			{ id: "n2", name: "Thomas Müller", jobTitle: "Planung" },
		];
		const searchUsers = vi.fn().mockResolvedValue({ users: namesakes, hasMore: false });
		const onWrittenMentionsChange = vi.fn();
		const { textarea } = setup({ searchUsers, onWrittenMentionsChange });

		type(textarea, "Hallo @Th");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
		fireEvent.keyDown(textarea, { key: "Enter" });
		expect(textarea.value).toBe("Hallo @Thomas Müller ");

		type(textarea, "Hallo @Thomas Müller und @Th");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
		fireEvent.keyDown(textarea, { key: "ArrowDown" });
		fireEvent.keyDown(textarea, { key: "Enter" });
		expect(textarea.value).toBe("Hallo @Thomas Müller und @Thomas Müller ");
		onWrittenMentionsChange.mockClear();

		// The first of the two deleted, the second one left standing.
		type(textarea, "Hallo und @Thomas Müller ", 6);

		expect(onWrittenMentionsChange).toHaveBeenLastCalledWith(["n2"]);
	});

	it("keeps both mentions safe when a second one is written where the first one started", async () => {
		const searchUsers = vi
			.fn()
			.mockResolvedValue({ users: [{ id: "u3", name: "Bob" }, ...USERS], hasMore: false });
		const { textarea } = setup({ searchUsers });
		type(textarea, "@Bo");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
		fireEvent.keyDown(textarea, { key: "Enter" });

		// A second mention written at the start pushes the first one along.
		type(textarea, "@An@Bob ", 3);
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
		fireEvent.keyDown(textarea, { key: "ArrowDown" });
		fireEvent.keyDown(textarea, { key: "Enter" });
		expect(textarea.value).toBe("@Anna Berger @Bob ");
		searchUsers.mockClear();

		type(textarea, "@Anna Berger @Bob t");

		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(searchUsers).not.toHaveBeenCalled();
	});

	it("says nothing about a failed notification once the form has closed", async () => {
		// The grace period outlives the editor, so the answer can arrive after it is gone.
		let fail: (error: Error) => void = () => undefined;
		const onMention = vi.fn(
			() =>
				new Promise<void>((_resolve, reject) => {
					fail = reject;
				})
		);
		const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			const { textarea, unmount } = setup({ onMention });
			type(textarea, "hi @An");
			await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
			fireEvent.keyDown(textarea, { key: "Enter" });

			unmount();
			fail(new Error("boom"));
			await new Promise((resolve) => setTimeout(resolve, 0));

			const warnings = errors.mock.calls.map((call) => String(call[0]));
			expect(warnings.some((warning) => warning.includes("unmounted"))).toBe(false);
		} finally {
			errors.mockRestore();
		}
	});

	it("puts the caret after the inserted mention, not at the end of the text", async () => {
		const { textarea } = setup();
		type(textarea, "cc @An, thanks", 6);
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		fireEvent.keyDown(textarea, { key: "Enter" });

		// "cc @Anna Berger " is 16 characters; the rest of the sentence follows it.
		expect(textarea.selectionStart).toBe(16);
	});

	it("draws the suggestion list outside its own container, where a form cannot clip it", async () => {
		// Inside the field cell the list was cut off by the first ancestor that hides overflow.
		const { textarea, container } = setup();
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		const list = screen.getByRole("listbox");
		expect(list).toBeTruthy();
		expect(container.contains(list)).toBe(false);
	});

	it("closes the suggestion list when the editor loses the focus", async () => {
		const { textarea } = setup();
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		fireEvent.blur(textarea);

		expect(screen.queryAllByRole("option")).toHaveLength(0);
	});

	it("lets an IME commit its candidate instead of picking a suggestion", async () => {
		const { textarea, onMention } = setup();
		type(textarea, "hi @An");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

		fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });

		expect(onMention).not.toHaveBeenCalled();
		expect(screen.getAllByRole("option")).toHaveLength(2);
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
