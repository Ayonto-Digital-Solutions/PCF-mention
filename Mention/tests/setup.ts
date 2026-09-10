/**
 * jsdom does not implement ResizeObserver, which Fluent's MessageBar observes for its
 * reflow behaviour. A no-op stand-in is enough for the assertions in this suite.
 */
class ResizeObserverStub {
	public observe(): void {
		// no-op
	}
	public unobserve(): void {
		// no-op
	}
	public disconnect(): void {
		// no-op
	}
}

if (!("ResizeObserver" in globalThis)) {
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
