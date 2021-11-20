/**
 * @summary Convert to slug-compatible string
 * @function
 * @private
 *
 * @param value - string to convert
 * @returns slugified string
 */
export function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-{1,}/g, '-');
}
