import { SuccessClient } from "./SuccessClient";
import { PROVIDERS, isProviderId } from "../../../src/connectors/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function ConnectSuccessPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams?.provider;
  const provider = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const rawAcc = searchParams?.account;
  const account = Array.isArray(rawAcc) ? rawAcc[0] : rawAcc ?? null;

  const name = isProviderId(provider) ? PROVIDERS[provider].name : provider || "App";

  const appRedirectUrl =
    process.env.MCPGRAM_APP_URL?.replace(/\/$/, "") ||
    process.env.MCPGRAM_BASE_URL?.replace(/\/$/, "") ||
    "https://mcpgram.vercel.app";

  return (
    <SuccessClient providerName={name} account={account} appRedirectUrl={appRedirectUrl} />
  );
}
