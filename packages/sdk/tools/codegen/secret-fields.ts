/** Explicit secret-bearing fields per operation (data-dictionary §2). The derived rule adds to these. */
export const SECRET_FIELDS: Record<string, string[]> = {
  CreateSecret: ["value"],
  PutSecretValue: ["value"],
  RotateSecret: ["value"],
  CreateIdentityProvider: ["clientSecret"],
  UpdateIdentityProvider: ["clientSecret"],
  CreateApiKey: ["secretKey"],
  CreateServiceApiKey: ["secretKey"],
  // contract v1.5.0: upstream model endpoint credentials (write-only)
  PutModelEndpointCredential: ["value"],
  RotateModelEndpointCredential: ["value"],
  PutTeamModelEndpointCredential: ["value"],
};

/** Names that look like secrets; a request property matching this must be listed or allowed. */
export const SECRET_LOOKING =
  /^(value|secret[A-Za-z]*|password|token|clientSecret|apiKey|credentials?)$/i;

/** Properties that match SECRET_LOOKING but hold no secret value (an id, a name or a reference). */
export const SECRET_ALLOWED = new Set<string>(["secretId", "secretName", "secretArn", "secretRef"]);

/** Operation.property pairs reviewed as non-secret (plain configuration values, tags, settings, references). */
export const SECRET_ALLOWED_OPS = new Set<string>([
  "PutServiceTag.value",
  "PutSetting.value",
  "PutAgentConfigValue.value",
  "PutNamespaceConfigValue.value",
  "PutPoolConfigValue.value",
  "CreateAgent.secretBindings",
  "UpdateAgent.secretBindings",
]);
