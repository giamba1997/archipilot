import { useState, useEffect } from "react";
import { useT } from "../i18n";
import { supabase } from "../supabase";
import { AC, SB, SBB, TX, TX2, TX3, WH, RD, GR, SP, FS, RAD } from "../constants/tokens";
import { Ico } from "../components/ui";

export function MfaSection() {
  const t = useT();
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error: err }) => {
      if (!err && data?.totp) {
        const verified = data.totp.filter((f) => f.status === "verified");
        setMfaEnabled(verified.length > 0);
        if (verified.length > 0) setFactorId(verified[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const startEnroll = async () => {
    setError(""); setMsg("");
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "ArchiPilot" });
    if (err) { setError(err.message); return; }
    setQrCode(data.totp.qr_code);
    setFactorId(data.id);
    setEnrolling(true);
  };

  const confirmEnroll = async () => {
    setError("");
    if (verifyCode.length !== 6) return;
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) { setError(chErr.message); return; }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: verifyCode });
    if (vErr) {
      setError(t("mfa.invalidCode"));
      return;
    }
    setMfaEnabled(true);
    setEnrolling(false);
    setVerifyCode("");
    setMsg(t("mfa.activated"));
  };

  const disableMfa = async () => {
    setError(""); setMsg("");
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
    if (err) { setError(err.message); return; }
    setMfaEnabled(false);
    setFactorId("");
    setMsg(t("mfa.deactivated"));
  };

  if (loading) return null;

  return (
    <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: "20px 20px 16px", marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: TX3, marginBottom: 4 }}>{t("mfa.title")}</div>
      <div style={{ fontSize: 12, color: TX3, marginBottom: 14, lineHeight: 1.5 }}>{t("mfa.desc")}</div>

      {msg && <div style={{ marginBottom: 12, padding: "8px 12px", background: "#EAF3DE", border: "1px solid #C6E9B4", borderRadius: 6, fontSize: 12, color: GR }}>{msg}</div>}
      {error && <div style={{ marginBottom: 12, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, color: RD }}>{error}</div>}

      {mfaEnabled && !enrolling ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: GR }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: GR }}>{t("mfa.enabled")}</span>
          </div>
          <button onClick={disableMfa} style={{ padding: "9px 18px", border: `1px solid #FECACA`, borderRadius: 8, background: "#FEF2F2", color: RD, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {t("mfa.disable")}
          </button>
        </div>
      ) : enrolling ? (
        <div>
          <div style={{ fontSize: 13, color: TX2, marginBottom: 14, lineHeight: 1.6 }}>{t("mfa.scanQR")}</div>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <img src={qrCode} alt="QR Code MFA" style={{ width: 180, height: 180, borderRadius: 8, border: `1px solid ${SBB}` }} />
          </div>
          <div style={{ fontSize: 13, color: TX2, marginBottom: 8 }}>{t("mfa.enterCode")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000" maxLength={6} autoComplete="one-time-code" inputMode="numeric" autoFocus
              style={{ flex: 1, padding: "11px 14px", border: `1px solid ${SBB}`, borderRadius: 8, fontSize: 18, fontWeight: 700, fontFamily: "inherit", background: SB, color: TX, textAlign: "center", letterSpacing: "0.3em", boxSizing: "border-box" }}
            />
            <button
              onClick={confirmEnroll} disabled={verifyCode.length !== 6}
              style={{ padding: "11px 18px", border: "none", borderRadius: 8, background: verifyCode.length === 6 ? AC : "#D3D1C7", color: "#fff", fontSize: 13, fontWeight: 600, cursor: verifyCode.length === 6 ? "pointer" : "not-allowed", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              {t("mfa.verify")}
            </button>
          </div>
          <button onClick={() => { setEnrolling(false); setVerifyCode(""); setError(""); }} style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", color: TX3, fontSize: 12, fontFamily: "inherit", padding: 0 }}>
            {t("mfa.cancel")}
          </button>
        </div>
      ) : (
        <button onClick={startEnroll} style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: AC, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {t("mfa.enable")}
        </button>
      )}
    </div>
  );
}
