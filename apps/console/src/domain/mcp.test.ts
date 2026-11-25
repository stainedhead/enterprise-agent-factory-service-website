import { describe, expect, it } from "vitest";
import { renderCli } from "./cli.js";
import {
  type AgentMcpSpec,
  APPROVAL_POLICIES,
  annotationClasses,
  approvalSentence,
  approverFor,
  checkName,
  checkView,
  classificationWord,
  createMcpServerCli,
  createTeamMcpServerCli,
  effectiveMcpServers,
  emptyMcpDraft,
  emptyRule,
  federatedEnvVar,
  federatedFilePath,
  importMcpServerManifestCli,
  kindWord,
  lastUsedWord,
  type McpServerDraft,
  mcpAuthWord,
  mcpCredentialView,
  mcpEnvPreview,
  mcpReasonWord,
  mcpServerUrlEnv,
  modeWord,
  ms,
  needsTeamCredential,
  parseManifest,
  pct,
  primitiveKindWord,
  primitiveStatusView,
  publishMcpServerCli,
  putFederatedIdentityCli,
  putMcpPolicyCli,
  putMcpServerCredentialCli,
  putSettingCli,
  putTeamMcpPolicyCli,
  putTeamMcpServerCli,
  putTeamMcpServerCredentialCli,
  reviewCli,
  reviewStatusView,
  riskView,
  ruleError,
  ruleWord,
  startMcpOAuthCli,
  startQueryCaptureCli,
  stepErrors,
  submitMcpServerCli,
  suspendMcpServerCli,
  teamApproveBlock,
  teamSwitchView,
  testMcpFederationCli,
  toAgentMcpBody,
  toCreateMcpServerBody,
  toCreateTeamMcpServerBody,
  toRules,
  transportWord,
  updateAgentMcpCli,
  usesOAuthConnect,
  usesSecretValue,
  validateAgentMcp,
  validateFederatedIdentity,
  validateMcpServer,
} from "./mcp.js";

const draft = (over: Partial<McpServerDraft> = {}): McpServerDraft => ({
  ...emptyMcpDraft("enterprise"),
  slug: "servicenow",
  displayName: "ServiceNow ITSM",
  url: "https://mcp.servicenow.corp.example/mcp",
  ...over,
});

describe("words and views", () => {
  it("names kinds, risk, auth, transport, mode, kinds and classifications", () => {
    expect(kindWord("enterprise")).toBe("Enterprise");
    expect(kindWord("team")).toBe("Team-managed");
    expect(riskView("low")).toEqual({ word: "Low", dot: "green" });
    expect(riskView("elevated").dot).toBe("amber");
    expect(riskView("high").dot).toBe("red");
    expect(riskView("odd")).toEqual({ word: "odd", dot: "grey" });
    expect(riskView(null).word).toBe("—");
    expect(mcpAuthWord("oauth_user")).toBe("User-delegated OAuth");
    expect(mcpAuthWord("x")).toBe("x");
    expect(transportWord("hosted", "in_namespace")).toBe("Hosted · stdio bridge");
    expect(transportWord("streamable_http", "external")).toBe("Remote · Streamable HTTP");
    expect(transportWord("streamable_http", "corporate")).toBe("Remote · corporate");
    expect(modeWord("read_only")).toBe("Read-only");
    expect(modeWord("full")).toBe("Full");
    expect(modeWord("x")).toBe("x");
    expect(primitiveKindWord("resource_template")).toBe("resource template");
    expect(primitiveKindWord("tool")).toBe("tool");
    expect(classificationWord("confidential")).toBe("Confidential");
    expect(classificationWord("")).toBe("—");
    expect(checkName("tls")).toBe("TLS valid");
    expect(checkName("other")).toBe("other");
  });
  it("shows review states as the catalog words them", () => {
    const v = (reviewStatus: string, scope = "enterprise", published = false) =>
      reviewStatusView({ reviewStatus, scope, published }).word;
    expect(v("approved", "enterprise", true)).toBe("Published");
    expect(v("approved")).toBe("Approved, not published");
    expect(v("approved", "team")).toBe("Approved");
    expect(v("draft")).toBe("Draft");
    expect(v("pending_review")).toBe("Pending review");
    expect(v("rejected")).toBe("Rejected");
    expect(v("suspended")).toBe("Suspended");
    expect(v("retired")).toBe("retired");
  });
  it("words credentials as metadata only", () => {
    expect(mcpCredentialView("set", "oauth_user").word).toBe("Connected");
    expect(mcpCredentialView("set", "static").word).toBe("Set");
    expect(mcpCredentialView("missing").word).toBe("Credential required");
    expect(mcpCredentialView("expired").word).toBe("Reconnect needed");
    expect(mcpCredentialView("not_required", "workload_federation").word).toBe("Ready");
    expect(mcpCredentialView("not_required", "none").word).toBe("Not required");
    expect(mcpCredentialView(undefined).word).toBe("—");
    expect(mcpCredentialView("odd").word).toBe("odd");
  });
  it("reads annotation classes", () => {
    expect(annotationClasses(undefined)).toEqual([]);
    expect(
      annotationClasses({ readOnlyHint: true, destructiveHint: true, openWorldHint: true }),
    ).toEqual(["read_only", "destructive", "open_world"]);
    expect(annotationClasses({ readOnlyHint: "yes" })).toEqual([]);
  });
  it("words a primitive: allowed, blocked at a level, held", () => {
    expect(primitiveStatusView({ status: "approved" }).word).toBe("Allowed");
    expect(
      primitiveStatusView({
        status: "approved",
        decision: { allowed: false, level: "service" },
      }).word,
    ).toBe("Blocked (service)");
    expect(primitiveStatusView({ status: "blocked" }).word).toBe("Blocked");
    expect(primitiveStatusView({ status: "pending_review", change: "compatible" }).word).toBe(
      "Changed · held",
    );
    expect(primitiveStatusView({ status: "pending_review", change: "new" }).word).toBe(
      "New · held",
    );
    expect(primitiveStatusView({ status: "pending_review" }).dot).toBe("amber");
  });
  it("words checks", () => {
    expect(checkView("pass").dot).toBe("green");
    expect(checkView("warn").word).toBe("Elevated");
    expect(checkView("fail").dot).toBe("red");
    expect(checkView("x").dot).toBe("grey");
  });
  it("words refusal and error reasons", () => {
    expect(mcpReasonWord("primitive_blocked_agent")).toBe("Blocked for the agent");
    expect(mcpReasonWord("other")).toBe("other");
    expect(mcpReasonWord(null)).toBe("—");
  });
});

describe("team switch and credential (MCP-US-3 AC-3.4, TC-13)", () => {
  const t = (over: Record<string, unknown> = {}, server: Record<string, unknown> = {}) => ({
    enabled: true,
    state: "on",
    credential: { state: "missing" },
    federationState: null,
    server: { authKind: "static", reviewStatus: "approved", credentialMode: "per_team", ...server },
    ...over,
  });
  it("shows Credential required until the team sets it", () => {
    expect(teamSwitchView(t()).word).toBe("Credential required");
    expect(needsTeamCredential(t())).toBe(true);
    expect(teamSwitchView(t({ credential: { state: "set" } })).word).toBe("Set");
    expect(needsTeamCredential(t({ credential: { state: "set" } }))).toBe(false);
  });
  it("needs no team credential for none, federation, SigV4 or a shared credential", () => {
    for (const authKind of ["none", "workload_federation", "aws_sigv4"])
      expect(needsTeamCredential(t({}, { authKind }))).toBe(false);
    expect(needsTeamCredential(t({}, { credentialMode: "shared" }))).toBe(false);
    expect(needsTeamCredential(t({ credential: null }))).toBe(true);
  });
  it("words off, pending, suspended and federation states", () => {
    expect(teamSwitchView(t({ enabled: false })).word).toBe("Not switched on");
    expect(teamSwitchView(t({ state: "pending" })).word).toBe("Pending");
    expect(teamSwitchView(t({}, { reviewStatus: "suspended" })).word).toBe("Suspended");
    const fed = (federationState: string | null) =>
      teamSwitchView(t({ federationState }, { authKind: "workload_federation" })).word;
    expect(fed("ok")).toBe("Ready");
    expect(fed("failed")).toBe("Federation failing");
    expect(fed(null)).toBe("Test the exchange");
    expect(teamSwitchView(t({ credential: null }, { authKind: "none" })).word).toBe("Not required");
  });
  it("tells OAuth connect from a pasted value", () => {
    expect(usesOAuthConnect("oauth_user")).toBe(true);
    expect(usesOAuthConnect("static")).toBe(false);
    expect(usesSecretValue("static")).toBe(true);
    expect(usesSecretValue("oauth_client")).toBe(true);
    expect(usesSecretValue("none")).toBe(false);
  });
});

describe("approval policy (MCP-US-4 AC-4.3, TC-16)", () => {
  it.each([
    ["team_all", "low", "team_admin"],
    ["team_all", "elevated", "team_admin"],
    ["team_all", "high", "team_admin"],
    ["team_low_security_higher", "low", "team_admin"],
    ["team_low_security_higher", "elevated", "security"],
    ["team_low_security_higher", null, "security"],
    ["security_all", "low", "security"],
  ] as const)("%s, %s → %s", (policy, tier, who) => {
    expect(approverFor(policy, tier)).toBe(who);
  });
  it("lists three policies with consequences, the default first", () => {
    expect(APPROVAL_POLICIES.map((p) => p.value)).toEqual([
      "team_all",
      "team_low_security_higher",
      "security_all",
    ]);
    for (const p of APPROVAL_POLICIES) expect(p.consequence.length).toBeGreaterThan(20);
  });
  it("blocks team approval of a server the policy sends to security (denied case)", () => {
    expect(teamApproveBlock({ approver: "security", reviewStatus: "pending_review" })).toMatch(
      /security operator/,
    );
    expect(teamApproveBlock({ approver: "team_admin", reviewStatus: "pending_review" })).toBe(
      undefined,
    );
    expect(teamApproveBlock({ approver: null, reviewStatus: "draft" })).toBe(
      "Submit the server for review first",
    );
  });
  it("explains the approver", () => {
    expect(approvalSentence("team_all", "low")).toMatch(/team-admin can approve/);
    expect(approvalSentence("security_all", "low")).toMatch(/security operator/);
  });
});

describe("server forms (screens 48, 51)", () => {
  it("accepts a valid enterprise draft", () => {
    expect(validateMcpServer(draft(), "enterprise")).toEqual({});
  });
  it("refuses bad, reserved and taken slugs", () => {
    expect(validateMcpServer(draft({ slug: "afs" }), "enterprise").slug).toMatch(/reserved/);
    expect(validateMcpServer(draft({ slug: "Bad" }), "enterprise").slug).toMatch(/lowercase/);
    expect(validateMcpServer(draft(), "enterprise", ["servicenow"]).slug).toMatch(/already/);
  });
  it("needs a name, owner and purpose for team servers, and an https doc link", () => {
    const e = validateMcpServer(draft({ displayName: " ", docUrl: "http://x" }), "team");
    expect(e.displayName).toBeDefined();
    expect(e.owner).toBeDefined();
    expect(e.purpose).toBeDefined();
    expect(e.docUrl).toBeDefined();
  });
  it("needs an https URL outside the namespace and a URL inside it", () => {
    expect(validateMcpServer(draft({ url: "" }), "enterprise").url).toMatch(/Enter/);
    expect(validateMcpServer(draft({ url: "http://x" }), "enterprise").url).toMatch(/https/);
    expect(
      validateMcpServer(draft({ url: "ftp://x", location: "in_namespace" }), "enterprise").url,
    ).toMatch(/URL/);
    expect(
      validateMcpServer(
        draft({ url: "http://ledger:8080/mcp", location: "in_namespace" }),
        "enterprise",
      ),
    ).toEqual({});
  });
  it("needs a hosted image pinned by digest (MCP-US-11 AC-11.1)", () => {
    const hosted = draft({ transport: "hosted", url: "" });
    expect(
      validateMcpServer({ ...hosted, imageDigest: "repo/img:1.0" }, "enterprise").imageDigest,
    ).toMatch(/digest/);
    expect(
      validateMcpServer(
        { ...hosted, imageDigest: `repo/img@sha256:${"a".repeat(64)}` },
        "enterprise",
      ),
    ).toEqual({});
    expect(
      validateMcpServer(
        { ...hosted, imageDigest: `r@sha256:${"a".repeat(64)}`, authKind: "aws_sigv4" },
        "enterprise",
      ).authKind,
    ).toBeDefined();
  });
  it("checks the header name and the federation fields", () => {
    expect(
      validateMcpServer(draft({ authKind: "static", authHeader: "bad header" }), "enterprise")
        .authHeader,
    ).toBeDefined();
    const fed = validateMcpServer(draft({ authKind: "workload_federation" }), "enterprise");
    expect(Object.keys(fed).sort()).toEqual(["audience", "issuer", "tokenEndpoint"]);
  });
  it("splits errors by wizard step", () => {
    const all = validateMcpServer(draft({ slug: "", url: "" }), "enterprise");
    expect(Object.keys(stepErrors("Server details", all))).toEqual(["slug"]);
    expect(Object.keys(stepErrors("Connection and authentication", all))).toEqual(["url"]);
    expect(stepErrors("Review and create", all)).toEqual({});
  });
  it("builds the create bodies without empty members", () => {
    const b = toCreateMcpServerBody(draft({ owner: "Platform" }));
    expect(b).toMatchObject({
      slug: "servicenow",
      transport: "streamable_http",
      location: "external",
      url: "https://mcp.servicenow.corp.example/mcp",
      authKind: "oauth_client",
      credentialMode: "per_team",
      driftPolicy: "hold",
      owner: "Platform",
    });
    expect(b).not.toHaveProperty("purpose");
    const none = toCreateMcpServerBody(draft({ authKind: "none" }));
    expect(none).not.toHaveProperty("credentialMode");
    const hosted = toCreateTeamMcpServerBody(
      draft({
        transport: "hosted",
        imageDigest: "r@sha256:1",
        owner: "Ravi",
        purpose: "FX",
        authKind: "workload_federation",
        audience: "api://fx",
        issuer: "https://i",
        tokenEndpoint: "https://t",
      }),
    );
    expect(hosted).toMatchObject({
      location: "in_namespace",
      hosted: { imageDigest: "r@sha256:1" },
      federation: { audience: "api://fx", issuer: "https://i", tokenEndpoint: "https://t" },
      owner: "Ravi",
      purpose: "FX",
    });
    expect(hosted).not.toHaveProperty("url");
    expect(toCreateMcpServerBody(draft({ authKind: "static", authHeader: "X-Key" }))).toMatchObject(
      { authHeader: "X-Key" },
    );
  });
  it("parses a server.json", () => {
    expect(parseManifest("")).toEqual({ error: "Paste a server.json" });
    expect(parseManifest("[1]")).toEqual({ error: "A server.json is a JSON object" });
    expect(parseManifest("{")).toEqual({ error: "This is not valid JSON" });
    expect(parseManifest('{"name":"x"}')).toEqual({ manifest: { name: "x" } });
  });
});

describe("policy rules (PRD §7.3)", () => {
  it("checks one rule", () => {
    expect(ruleError({ ...emptyRule(), name: "delete_*" })).toBeUndefined();
    expect(ruleError(emptyRule())).toMatch(/name/);
    expect(ruleError({ ...emptyRule(), by: "class" })).toBeUndefined();
    expect(
      ruleError({ ...emptyRule(), effect: "allow", name: "x", rateLimitPerMinute: "0" }),
    ).toMatch(/whole/);
    expect(
      ruleError({ ...emptyRule(), effect: "block", name: "x", rateLimitPerMinute: "10" }),
    ).toMatch(/allowed/);
  });
  it("builds and words rules", () => {
    const rules = toRules([
      { ...emptyRule(), name: " delete_* " },
      { ...emptyRule(), by: "class", class: "destructive" },
      { ...emptyRule(), effect: "allow", name: "add_comment", rateLimitPerMinute: "30" },
    ]);
    expect(rules).toEqual([
      { effect: "block", name: "delete_*" },
      { effect: "block", class: "destructive" },
      { effect: "allow", name: "add_comment", rateLimitPerMinute: 30 },
    ]);
    expect(rules.map(ruleWord)).toEqual([
      "Block delete_*",
      "Block annotation: destructive",
      "Rate limit add_comment · 30 / min per agent",
    ]);
    expect(ruleWord({ effect: "allow", name: "x" })).toBe("Allow x");
  });
});

describe("agent MCP (screen 52, TC-25)", () => {
  const team = [
    { id: "mcp_2", slug: "github" },
    { id: "mcp_1", slug: "eng-handbook" },
    { id: "mcp_3", slug: "ledger-schema" },
  ];
  const spec = (over: Partial<AgentMcpSpec> = {}): AgentMcpSpec => ({
    access: "all",
    serverIds: [],
    mode: "search",
    blocks: [],
    ...over,
  });
  it("reaches every team server with All and the selection with Selected, sorted", () => {
    expect(effectiveMcpServers(spec(), team).map((s) => s.slug)).toEqual([
      "eng-handbook",
      "github",
      "ledger-schema",
    ]);
    expect(
      effectiveMcpServers(spec({ access: "selected", serverIds: ["mcp_2"] }), team).map(
        (s) => s.slug,
      ),
    ).toEqual(["github"]);
  });
  it("renders the environment in the gateway contract's order (§13.5)", () => {
    const env = mcpEnvPreview(
      spec({ access: "selected", serverIds: ["mcp_2", "mcp_3"] }),
      team,
      "https://gw:8443",
    );
    expect(env.map((l) => `${l.name}=${l.value}`)).toEqual([
      "AFS_MCP_URL=https://gw:8443/mcp",
      "AFS_MCP_MODE=search",
      "AFS_MCP_SERVERS=github,ledger-schema",
      "AFS_MCP_GITHUB_URL=https://gw:8443/mcp/github",
      "AFS_MCP_LEDGER_SCHEMA_URL=https://gw:8443/mcp/ledger-schema",
    ]);
    expect(mcpEnvPreview(spec({ access: "selected" }), team)).toEqual([]);
    expect(mcpEnvPreview(spec(), team)[0]?.value).toBe(`\${AFS_GATEWAY_URL}/mcp`);
    expect(mcpServerUrlEnv("eng-handbook")).toBe("AFS_MCP_ENG_HANDBOOK_URL");
  });
  it("refuses a selected server that is not on and an empty block", () => {
    expect(
      validateAgentMcp(spec({ access: "selected", serverIds: ["mcp_9"] }), team).serverIds,
    ).toBeDefined();
    expect(
      validateAgentMcp(spec({ blocks: [{ serverId: "mcp_2", name: " " }] }), team).blocks,
    ).toBeDefined();
    expect(validateAgentMcp(spec(), team)).toEqual({});
  });
  it("builds the mcp body of UpdateAgent", () => {
    expect(toAgentMcpBody(spec())).toEqual({ access: "all", mode: "search", blocks: [] });
    expect(
      toAgentMcpBody(
        spec({
          access: "selected",
          serverIds: ["mcp_2"],
          mode: "full",
          blocks: [{ serverId: "mcp_2", name: " merge_pull_request " }],
        }),
      ),
    ).toEqual({
      access: "selected",
      serverIds: ["mcp_2"],
      mode: "full",
      blocks: [{ serverId: "mcp_2", name: "merge_pull_request", effect: "block" }],
    });
  });
});

describe("usage words", () => {
  it("formats percentages, latency and last use", () => {
    expect(pct(11, 1000)).toBe("1.1%");
    expect(pct(1, 0)).toBe("—");
    expect(ms(820)).toBe("820 ms");
    expect(ms(1400)).toBe("1.4 s");
    expect(ms(null)).toBe("—");
    const now = Date.parse("2026-11-25T00:00:00Z");
    expect(lastUsedWord(null, now)).toBe("Never");
    expect(lastUsedWord("2026-11-25T00:00:00Z", now)).toBe("Today");
    expect(lastUsedWord("2026-11-24T00:00:00Z", now)).toBe("1 day ago");
    expect(lastUsedWord("2026-10-15T00:00:00Z", now)).toBe("41 days ago");
    expect(lastUsedWord("garbage", now)).toBe("—");
  });
});

describe("federated identities (PRD Appendix C)", () => {
  it("names the env var and file", () => {
    expect(federatedEnvVar("azure-cli")).toBe("AFS_FEDERATED_TOKEN_FILE_AZURE_CLI");
    expect(federatedFilePath("azure-cli")).toBe("/var/run/secrets/afs/federation/azure-cli/token");
  });
  it("checks name, audience and expiry", () => {
    const ok = {
      name: "azure-cli",
      audience: "api://AzureADTokenExchange",
      expirationSeconds: "3600",
    };
    expect(validateFederatedIdentity(ok, [])).toEqual({});
    expect(validateFederatedIdentity({ ...ok, name: "Bad" }, []).name).toBeDefined();
    expect(validateFederatedIdentity(ok, ["azure-cli"]).name).toMatch(/already/);
    expect(
      validateFederatedIdentity(
        ok,
        Array.from({ length: 10 }, (_, i) => `n${i}`),
      ).name,
    ).toMatch(/10/);
    expect(validateFederatedIdentity({ ...ok, audience: "" }, []).audience).toBeDefined();
    expect(
      validateFederatedIdentity({ ...ok, audience: "sts.amazonaws.com" }, []).audience,
    ).toMatch(/Pod Identity/);
    expect(validateFederatedIdentity({ ...ok, audience: "afs-gateway" }, []).audience).toMatch(
      /reserved/,
    );
    expect(
      validateFederatedIdentity({ ...ok, expirationSeconds: "60" }, []).expirationSeconds,
    ).toBeDefined();
  });
});

describe("CLI previews (WEB-6)", () => {
  const r = renderCli;
  it("renders the create commands of screens 48 and 51", () => {
    expect(r(createMcpServerCli(draft()))).toBe(
      "afs mcp-servers create-mcp-server --auth-kind oauth_client --credential-mode per_team --data-classification internal --display-name 'ServiceNow ITSM' --drift-policy hold --location external --slug servicenow --transport streamable_http --no-trust-annotations --url https://mcp.servicenow.corp.example/mcp",
    );
    expect(
      r(
        createTeamMcpServerCli("team_1", draft({ owner: "Ravi", purpose: "FX", authKind: "none" })),
      ),
    ).toMatch(
      /^afs teams create-team-mcp-server --team-id team_1 --auth-kind none .*--owner Ravi --purpose FX/,
    );
    expect(r(importMcpServerManifestCli("snow"))).toBe(
      "afs mcp-servers import-mcp-server-manifest --manifest file://server.json --slug snow",
    );
    expect(r(importMcpServerManifestCli())).toBe(
      "afs mcp-servers import-mcp-server-manifest --manifest file://server.json",
    );
  });
  it("renders lifecycle and review commands", () => {
    expect(r(publishMcpServerCli("mcp_1"))).toBe(
      "afs mcp-servers publish-mcp-server --mcp-server-id mcp_1",
    );
    expect(r(submitMcpServerCli("team_1", "mcp_1"))).toBe(
      "afs teams submit-mcp-server-for-review --team-id team_1 --mcp-server-id mcp_1",
    );
    expect(r(reviewCli("approve", "mcp_1", "ok"))).toBe(
      "afs mcp-servers approve-mcp-server --mcp-server-id mcp_1 --note ok",
    );
    expect(r(reviewCli("reject", "mcp_1", "no"))).toMatch(/reject-mcp-server/);
    expect(r(reviewCli("request-changes", "mcp_1", "fix", [], "team_1"))).toMatch(
      /request-mcp-server-changes/,
    );
    expect(
      r(reviewCli("approve", "mcp_1", "ok", [{ primitiveId: "p1", decision: "block" }], "team_1")),
    ).toBe(
      `afs teams approve-team-mcp-server --team-id team_1 --mcp-server-id mcp_1 --note ok --primitives '[{"primitiveId":"p1","decision":"block"}]'`,
    );
    expect(r(reviewCli("reject", "mcp_1", "no", [], "team_1"))).toMatch(/reject-team-mcp-server/);
    expect(r(suspendMcpServerCli("mcp_1", true, "incident"))).toBe(
      "afs mcp-servers suspend-mcp-server --mcp-server-id mcp_1 --reason incident",
    );
    expect(r(suspendMcpServerCli("mcp_1", false, "fixed"))).toMatch(/resume-mcp-server/);
  });
  it("renders policy commands", () => {
    expect(r(putMcpPolicyCli("mcp_1", [{ ...emptyRule(), name: "delete_*" }]))).toBe(
      `afs mcp-servers put-mcp-policy --mcp-server-id mcp_1 --rules '[{"effect":"block","name":"delete_*"}]'`,
    );
    expect(r(putTeamMcpPolicyCli("team_1", "mcp_1", []))).toBe(
      "afs teams put-team-mcp-policy --team-id team_1 --mcp-server-id mcp_1 --rules '[]'",
    );
  });
  it("never puts a credential value on the line", () => {
    expect(r(putMcpServerCredentialCli("mcp_1", "_shared", "static"))).toBe(
      "afs mcp-servers put-mcp-server-credential --mcp-server-id mcp_1 --scope _shared --secret-value file://<path>",
    );
    expect(r(putMcpServerCredentialCli("mcp_1", "team_1", "oauth_client"))).toBe(
      "afs mcp-servers put-mcp-server-credential --mcp-server-id mcp_1 --scope team_1 --client-id '<client id>' --client-secret file://<path>",
    );
    expect(r(putTeamMcpServerCredentialCli("team_1", "mcp_1", "static"))).toBe(
      "afs teams put-team-mcp-server-credential --team-id team_1 --mcp-server-id mcp_1 --secret-value file://<path>",
    );
    expect(r(putTeamMcpServerCredentialCli("team_1", "mcp_1", "oauth_client"))).toMatch(
      /--client-secret file:\/\/<path>$/,
    );
  });
  it("renders team switch, OAuth, federation, agent, capture, identity and setting commands", () => {
    expect(r(putTeamMcpServerCli("team_1", "mcp_1", true, "read_only"))).toBe(
      "afs teams put-team-mcp-server --team-id team_1 --mcp-server-id mcp_1 --enabled --mode read_only",
    );
    expect(r(putTeamMcpServerCli("team_1", "mcp_1", false, "full"))).toBe(
      "afs teams put-team-mcp-server --team-id team_1 --mcp-server-id mcp_1 --no-enabled",
    );
    expect(r(startMcpOAuthCli("team_1", "mcp_1"))).toMatch(/start-mcp-oauth-connect/);
    expect(r(testMcpFederationCli("team_1", "mcp_1"))).toMatch(/test-mcp-federation/);
    expect(
      r(
        updateAgentMcpCli("team_1", "agt_1", {
          access: "all",
          serverIds: [],
          mode: "full",
          blocks: [],
        }),
      ),
    ).toBe(
      `afs agents update-agent --team-id team_1 --agent-id agt_1 --mcp '{"access":"all","mode":"full","blocks":[]}'`,
    );
    expect(r(startQueryCaptureCli(7, "tuning"))).toBe(
      "afs mcp-servers start-mcp-query-capture --days 7 --reason tuning",
    );
    expect(
      r(
        putFederatedIdentityCli("team_1", "agt_1", {
          name: "azure-cli",
          audience: "api://x",
          expirationSeconds: "3600",
        }),
      ),
    ).toBe(
      "afs agents put-agent-federated-identity --team-id team_1 --agent-id agt_1 --name azure-cli --audience api://x --expiration-seconds 3600",
    );
    expect(
      r(putFederatedIdentityCli("t", "a", { name: "n", audience: "x", expirationSeconds: "" })),
    ).not.toMatch(/expiration/);
    expect(r(putSettingCli("mcp.team_server_approval", "security_all"))).toBe(
      "afs admin put-setting --key mcp.team_server_approval --value security_all",
    );
  });
});
