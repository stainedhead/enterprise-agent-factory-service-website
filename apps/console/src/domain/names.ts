/** Team and resource slugs: lower-case, 3 to 40 characters, start with a letter, no trailing hyphen. */
export const NAME_PATTERN = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

export function isValidName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

const CREDENTIAL_LIKE = /(password|secret|token|key)/i;

/** A configuration value name that looks like a credential belongs in Secrets (WEB-US-30.2). */
export function isCredentialLikeName(name: string): boolean {
  return CREDENTIAL_LIKE.test(name);
}
