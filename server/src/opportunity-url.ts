export function validatedOpportunityUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'string') {
    try {
      const url = new URL(value.trim());
      if (['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password) return url.href;
    } catch {}
  }
  throw Object.assign(new Error('Enter a valid http:// or https:// URL without embedded credentials.'), {status: 400});
}
