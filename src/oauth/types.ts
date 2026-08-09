export type OAuthClientRecord = {
  typ: "client";
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  iat: number;
};

/** One workspace + API key granted at consent. */
export type WorkspaceGrant = {
  id: string;
  name?: string;
  api_key: string;
};

export type AuthCodeRecord = {
  typ: "code";
  code_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  user_id: string;
  /** Primary workspace (first selected). Kept for backward compatibility. */
  workspace_id: string;
  /** Encrypted MCPGRAM API key for primary workspace. */
  api_key: string;
  /** All selected workspaces (includes primary). */
  workspaces: WorkspaceGrant[];
  scope: string;
  exp: number;
};

export type AccessTokenClaims = {
  typ: "access";
  sub: string;
  client_id: string;
  workspace_id: string;
  api_key: string;
  workspaces: WorkspaceGrant[];
  scope: string;
  /** Unique token id for revocation. */
  jti: string;
  iat: number;
  exp: number;
};

export type RefreshTokenClaims = {
  typ: "refresh";
  sub: string;
  client_id: string;
  workspace_id: string;
  api_key: string;
  workspaces: WorkspaceGrant[];
  scope: string;
  /** Unique token id — rotated on each refresh. */
  jti: string;
  /** Stable family id — reuse of a rotated token can kill the family. */
  fid: string;
  iat: number;
  exp: number;
};
