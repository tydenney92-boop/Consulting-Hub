/** Display enum values readably without changing the values submitted to the API. */
export const optionLabel = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
