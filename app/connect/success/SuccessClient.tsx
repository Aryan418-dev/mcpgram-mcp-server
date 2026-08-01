"use client";

import { useEffect } from "react";
import { styles } from "../../authorize/consentStyles";

type Props = {
  providerName: string;
  account?: string | null;
  appRedirectUrl: string;
};

const MCPGRAM_LOGO = "/logo-on-dark.png";

export function SuccessClient({ providerName, account, appRedirectUrl }: Props) {
  useEffect(() => {
    const t = window.setTimeout(() => {
      window.location.href = appRedirectUrl;
    }, 1800);
    return () => window.clearTimeout(t);
  }, [appRedirectUrl]);

  return (
    <main style={styles.page}>
      <style>{`
        @keyframes successPop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes successGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.35); }
          50% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
        }
        .success-check {
          animation: successPop 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards,
                     successGlow 1.2s ease-out 0.2s 2;
        }
      `}</style>

      <div style={styles.header}>
        <div style={styles.logoBox} title={providerName}>
          <div style={styles.clientInitial}>{providerName.slice(0, 1).toUpperCase()}</div>
        </div>
        <div style={styles.connector} aria-hidden>
          <div className="success-check" style={styles.successRing}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="#22C55E"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <div style={styles.logoBox} title="MCPGRAM">
          <img src={MCPGRAM_LOGO} alt="MCPGRAM" width={32} height={32} style={{ display: "block", objectFit: "contain" }} />
        </div>
      </div>

      <h1 style={styles.title}>Successfully Connected</h1>
      <p style={styles.subtitle}>
        {providerName}
        {account ? ` (${account})` : ""} is now linked to MCPGRAM.
        Redirecting you to MCPGRAM…
      </p>

      <button
        type="button"
        style={styles.btnPrimary}
        onClick={() => {
          window.location.href = appRedirectUrl;
        }}
      >
        Continue to MCPGRAM
      </button>
    </main>
  );
}
