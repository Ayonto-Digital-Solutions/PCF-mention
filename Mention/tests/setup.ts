/**
 * Stand-ins for the two observers Fluent uses when it positions a popup, for the case that the
 * test environment does not provide them.
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

class IntersectionObserverStub {
	public readonly root = null;
	public readonly rootMargin = "";
	public readonly thresholds: readonly number[] = [];

	public observe(): void {
		// no-op
	}
	public unobserve(): void {
		// no-op
	}
	public disconnect(): void {
		// no-op
	}
	public takeRecords(): [] {
		return [];
	}
}

if (!("ResizeObserver" in globalThis)) {
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

if (!("IntersectionObserver" in globalThis)) {
	(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
		IntersectionObserverStub;
}
