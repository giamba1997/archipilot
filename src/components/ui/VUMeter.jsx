import { useAudioLevel } from "../../hooks/useAudioLevel";
import { SB, SBB, TX, TX2, TX3, WH, RD, BR, AM, SG, SP, FS, RAD } from "../../constants/tokens";

// VUMeter — barre segmentée façon mixer audio + texte d'aide adaptatif.
// Active uniquement quand `active=true` (ouvre/ferme le mic). Affiche un
// niveau 0-100 avec 14 segments codés couleur :
//   0-2   gris  (silence)
//   3-15  ambre (trop bas)
//   16-78 vert  (parfait)
//   79+   rouge (saturation)
const SEG_COUNT = 14;

const helperFor = (level, error) => {
  if (error === "micDenied") return { msg: "Microphone refusé. Autorise l'accès dans ton navigateur.", tone: "err" };
  if (error === "noMic") return { msg: "Aucun micro détecté.", tone: "err" };
  if (error) return { msg: "Erreur micro.", tone: "err" };
  if (level < 3) return { msg: "Aucun son capté — approche-toi ou parle plus fort.", tone: "warn" };
  if (level < 16) return { msg: "Trop faible — rapproche-toi du micro.", tone: "warn" };
  if (level > 90) return { msg: "Saturation — éloigne-toi un peu.", tone: "warn" };
  return { msg: "Niveau parfait, continue à parler.", tone: "ok" };
};

const segColor = (segIndex, level) => {
  // Threshold pour qu'un segment soit "allumé"
  const threshold = ((segIndex + 1) / SEG_COUNT) * 100;
  if (level < threshold) return SBB; // off
  // Couleur selon position du segment
  if (segIndex < 2) return AM;        // segments très bas = ambre (signal faible)
  if (segIndex < SEG_COUNT - 2) return SG;
  return RD;                            // 2 derniers = rouge (saturation)
};

export function VUMeter({ active, label, stream }) {
  const { level, error } = useAudioLevel(active, stream || null);
  const helper = helperFor(level, error);
  const helperColor = helper.tone === "err" ? RD : helper.tone === "warn" ? BR : SG;

  return (
    <div style={{
      width: "100%", maxWidth: 360,
      padding: `${SP.sm + 2}px ${SP.md + 2}px`,
      background: WH, border: `1px solid ${SBB}`, borderRadius: RAD.lg,
      display: "flex", flexDirection: "column", gap: SP.xs + 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: FS.xs, fontWeight: 700, color: TX3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label || "Niveau du micro"}
        </span>
        <span style={{ fontSize: FS.xs, color: TX3, fontVariantNumeric: "tabular-nums", minWidth: 28, textAlign: "right" }}>
          {Math.round(level)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, height: 14, alignItems: "stretch" }}>
        {Array.from({ length: SEG_COUNT }, (_, i) => (
          <div key={i} style={{
            flex: 1,
            background: segColor(i, level),
            borderRadius: 2,
            transition: "background 80ms linear",
          }} />
        ))}
      </div>
      <div style={{ fontSize: FS.xs, color: helperColor, lineHeight: 1.4, minHeight: 14 }}>
        {helper.msg}
      </div>
    </div>
  );
}
