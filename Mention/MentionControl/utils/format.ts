/**
 * Substitutes {0}, {1}, … in a localized template.
 *
 * Localized text has to carry its own word order, so counts and names are placed by the resx
 * string rather than concatenated around it.
 */
export function interpolate(template: string, ...values: string[]): string {
	return template.replace(/\{(\d+)\}/g, (match, index: string) => values[Number(index)] ?? match);
}
