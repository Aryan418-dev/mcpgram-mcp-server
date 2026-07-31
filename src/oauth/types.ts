export type OAuthClientRecord = {
  typ: "client";
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  iat: number;
};

export type AuthCodeRecord = {
  typ: "code";
  code_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  user_id: string;
  workspace_id: string;
  /** Raw MCPGRAM API key issued at consent time (embedded only in signed code). */
  api_key: string;
  scope: string;
  exp: number;
};

export type AccessTokenClaims = {
  typ: "access";
  sub: string;
  client_id: string;
  workspace_id: string;
  api_key: string;
  scope: string;
  iat: number;
  exp: number;
};

export type RefreshTokenClaims = {
  typ: "refresh";
  sub: string;
  client_id: string;
  workspace_id: string;
  api_key: string;
  scope: string;
  iat: number;
  exp: number;
};
