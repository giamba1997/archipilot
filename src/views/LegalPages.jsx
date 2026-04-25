import { useState } from "react";
import { AC, TX, TX2, TX3, SB, SBB, WH, BG } from "../constants/tokens";

// ── Legal page content ─────────────────────────────────────
const LEGAL_CONTENT = {
  privacy: {
    title: "Politique de Confidentialité",
    lastUpdated: "18 avril 2026",
    sections: [
      {
        title: "1. Responsable du traitement",
        content: `ArchiPilot est un service édité par ArchiPilot SRL, dont le siège social est situé en Belgique.
Email de contact : privacy@archipilot.app

En tant que responsable du traitement, nous déterminons les finalités et les moyens du traitement de vos données personnelles conformément au Règlement Général sur la Protection des Données (RGPD - Règlement UE 2016/679).`,
      },
      {
        title: "2. Données collectées",
        content: `Nous collectons les catégories de données suivantes :

• Données d'identification : nom, prénom, adresse email, nom de la structure professionnelle.
• Données de connexion : adresse IP, type de navigateur, appareil, horodatage des connexions.
• Données de projet : noms de projets, adresses de chantier, noms de participants, remarques de chantier, procès-verbaux, photos de chantier.
• Données d'utilisation : pages visitées, fonctionnalités utilisées, événements analytiques anonymisés.
• Données de paiement : traitées exclusivement par notre prestataire Stripe. Nous ne stockons jamais vos coordonnées bancaires.`,
      },
      {
        title: "3. Finalités et bases légales",
        content: `Vos données sont traitées pour les finalités suivantes :

• Exécution du contrat (Art. 6.1.b RGPD) : fourniture du service ArchiPilot, gestion de votre compte, génération de PV, envoi d'emails aux participants.
• Intérêt légitime (Art. 6.1.f RGPD) : amélioration du service, analytics agrégés, détection de fraude et sécurité.
• Consentement (Art. 6.1.a RGPD) : envoi de communications marketing (optionnel, révocable à tout moment).`,
      },
      {
        title: "4. Partage des données",
        content: `Vos données peuvent être partagées avec les sous-traitants suivants, tous conformes au RGPD :

• Supabase (hébergement, base de données) — serveurs UE
• OpenAI (génération IA de PV) — les données envoyées ne sont pas utilisées pour l'entraînement
• Resend (envoi d'emails transactionnels)
• Stripe (paiement)
• Vercel (hébergement frontend)

Nous ne vendons jamais vos données à des tiers.`,
      },
      {
        title: "5. Durée de conservation",
        content: `• Données de compte : conservées tant que votre compte est actif, puis supprimées dans les 30 jours suivant la suppression du compte.
• Données de projet : conservées tant que le projet existe dans votre compte.
• Logs de connexion : conservés 12 mois maximum.
• Données analytiques : anonymisées et agrégées, conservées 24 mois.`,
      },
      {
        title: "6. Vos droits",
        content: `Conformément au RGPD, vous disposez des droits suivants :

• Droit d'accès : obtenir une copie de vos données personnelles.
• Droit de rectification : corriger vos données inexactes.
• Droit à l'effacement : demander la suppression de votre compte et de toutes vos données.
• Droit à la portabilité : recevoir vos données dans un format structuré (JSON).
• Droit d'opposition : vous opposer au traitement pour motif légitime.
• Droit de limitation : restreindre le traitement dans certains cas.

Pour exercer ces droits, contactez-nous à privacy@archipilot.app ou utilisez la fonction "Supprimer mon compte" dans vos paramètres.

Vous pouvez également introduire une réclamation auprès de l'Autorité de Protection des Données (APD) belge : www.autoriteprotectiondonnees.be`,
      },
      {
        title: "7. Cookies",
        content: `ArchiPilot utilise uniquement des cookies strictement nécessaires au fonctionnement du service :

• Cookie de session d'authentification (Supabase Auth)
• Stockage local (localStorage) pour la mise en cache hors ligne

Nous n'utilisons pas de cookies publicitaires ni de trackers tiers. Aucun consentement n'est requis pour les cookies strictement nécessaires (Art. 5.3 Directive ePrivacy).`,
      },
      {
        title: "8. Sécurité",
        content: `Nous mettons en œuvre les mesures techniques et organisationnelles suivantes :

• Chiffrement TLS en transit (HTTPS)
• Authentification à deux facteurs (MFA/TOTP) disponible
• Row Level Security (RLS) au niveau de la base de données
• Mots de passe soumis à des critères de complexité (12 caractères, majuscule, caractère spécial)
• Clés API stockées exclusivement côté serveur`,
      },
      {
        title: "9. Modifications",
        content: `Cette politique peut être mise à jour. En cas de modification substantielle, nous vous en informerons par email ou par notification dans l'application. La date de dernière mise à jour est indiquée en haut de cette page.`,
      },
    ],
  },

  terms: {
    title: "Conditions Générales d'Utilisation",
    lastUpdated: "18 avril 2026",
    sections: [
      {
        title: "1. Objet",
        content: `Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation du service ArchiPilot, une application web de suivi de chantier et de génération de procès-verbaux destinée aux professionnels de l'architecture et de la construction.`,
      },
      {
        title: "2. Acceptation",
        content: `En créant un compte ArchiPilot, vous acceptez sans réserve les présentes CGU. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser le service.`,
      },
      {
        title: "3. Description du service",
        content: `ArchiPilot propose les fonctionnalités suivantes selon le plan souscrit :

• Suivi de chantier : création de projets, gestion de remarques, suivi des lots et actions.
• Génération de PV : rédaction assistée par intelligence artificielle de procès-verbaux de chantier.
• Collaboration : partage de projets avec d'autres utilisateurs (contributeurs, lecteurs).
• Envoi de PV par email : distribution des PV aux participants du chantier.
• Galerie photos : stockage et annotation de photos de chantier.
• Planning : gestion de la planification du chantier.`,
      },
      {
        title: "4. Comptes et abonnements",
        content: `• Inscription : un compte est nécessaire pour utiliser ArchiPilot. Vous devez fournir des informations exactes.
• Plans : ArchiPilot propose trois plans (Free, Pro, Team) avec des fonctionnalités et limites différentes.
• Paiement : les plans payants sont facturés mensuellement ou annuellement via Stripe. Les prix sont indiqués TTC.
• Résiliation : vous pouvez résilier votre abonnement à tout moment. L'accès aux fonctionnalités payantes est maintenu jusqu'à la fin de la période facturée.
• Remboursement : aucun remboursement n'est accordé pour les périodes entamées, sauf obligation légale.`,
      },
      {
        title: "5. Utilisation acceptable",
        content: `Vous vous engagez à :

• Utiliser le service conformément à sa finalité professionnelle.
• Ne pas tenter de contourner les limitations techniques du service.
• Ne pas utiliser le service pour envoyer du spam ou du contenu illicite.
• Maintenir la confidentialité de vos identifiants de connexion.
• Respecter la propriété intellectuelle d'ArchiPilot et des tiers.`,
      },
      {
        title: "6. Propriété intellectuelle",
        content: `• Le service : le code source, le design, les marques et le contenu d'ArchiPilot sont la propriété exclusive d'ArchiPilot SRL.
• Vos données : vous conservez la propriété intégrale de vos données (projets, PV, photos). ArchiPilot n'acquiert aucun droit sur votre contenu.
• Licence d'utilisation : ArchiPilot vous accorde une licence non exclusive, non transférable, révocable d'utilisation du service pendant la durée de votre abonnement.`,
      },
      {
        title: "7. Responsabilité",
        content: `• ArchiPilot est fourni "en l'état". Nous nous efforçons d'assurer la disponibilité et la fiabilité du service, mais ne garantissons pas une disponibilité ininterrompue.
• Les PV générés par l'IA sont des aides à la rédaction. L'utilisateur reste seul responsable de la vérification et de la validation du contenu avant diffusion.
• ArchiPilot ne saurait être tenu responsable des dommages indirects résultant de l'utilisation du service.
• Notre responsabilité totale est limitée au montant des sommes versées par l'utilisateur au cours des 12 derniers mois.`,
      },
      {
        title: "8. Résiliation",
        content: `• Par l'utilisateur : vous pouvez supprimer votre compte à tout moment depuis vos paramètres.
• Par ArchiPilot : nous nous réservons le droit de suspendre ou supprimer un compte en cas de violation des présentes CGU, après notification préalable sauf urgence.`,
      },
      {
        title: "9. Droit applicable",
        content: `Les présentes CGU sont régies par le droit belge. En cas de litige, les tribunaux de Bruxelles sont seuls compétents, sous réserve des dispositions impératives applicables en matière de protection des consommateurs.`,
      },
      {
        title: "10. Contact",
        content: `Pour toute question relative aux présentes CGU :
Email : contact@archipilot.app`,
      },
    ],
  },
};

// ── Legal Page Component (standalone, works in auth or app) ──
export function LegalPage({ page, onBack }) {
  const content = LEGAL_CONTENT[page];
  if (!content) return null;

  return (
    <div style={{
      minHeight: "100dvh",
      background: BG,
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: "24px 20px 60px",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, color: AC, fontFamily: "inherit",
            padding: "8px 0", marginBottom: 16,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Retour
        </button>

        {/* Title */}
        <h1 style={{ fontSize: 28, fontWeight: 800, color: TX, marginBottom: 6 }}>
          {content.title}
        </h1>
        <p style={{ fontSize: 13, color: TX3, marginBottom: 32 }}>
          Dernière mise à jour : {content.lastUpdated}
        </p>

        {/* Sections */}
        {content.sections.map((section, i) => (
          <div key={i} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 10 }}>
              {section.title}
            </h2>
            <div style={{
              fontSize: 14, lineHeight: 1.8, color: TX2,
              whiteSpace: "pre-line",
            }}>
              {section.content}
            </div>
          </div>
        ))}

        {/* Footer */}
        <div style={{
          marginTop: 40, paddingTop: 20,
          borderTop: `1px solid ${SBB}`,
          fontSize: 12, color: TX3, textAlign: "center",
        }}>
          © {new Date().getFullYear()} ArchiPilot SRL — Tous droits réservés
        </div>
      </div>
    </div>
  );
}

// ── Cookie Banner Component ──────────────────────────────────
export function CookieBanner() {
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem("archipilot_cookie_consent");
    } catch {
      return true;
    }
  });

  if (!visible) return null;

  const accept = () => {
    try { localStorage.setItem("archipilot_cookie_consent", "accepted"); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10000,
      background: WH, borderTop: `1px solid ${SBB}`,
      boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
      padding: "14px 20px",
      animation: "fadeSlide 0.3s ease-out",
    }}>
      <div style={{
        maxWidth: 960, margin: "0 auto",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap",
      }}>
        <p style={{ fontSize: 13, color: TX2, lineHeight: 1.5, margin: 0, flex: 1, minWidth: 200 }}>
          ArchiPilot utilise uniquement des cookies strictement nécessaires au fonctionnement du service (authentification, cache hors ligne). Aucun cookie publicitaire n'est utilisé.
          {" "}
          <span style={{ color: TX3, fontSize: 12 }}>
            Voir notre <a href="#" onClick={(e) => { e.preventDefault(); window.__showLegal?.("privacy"); }} style={{ color: AC, textDecoration: "underline" }}>Politique de Confidentialité</a>.
          </span>
        </p>
        <button
          onClick={accept}
          style={{
            padding: "9px 20px", border: "none", borderRadius: 8,
            background: AC, color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Compris
        </button>
      </div>
    </div>
  );
}

// ── Legal Links (for footer / auth page) ─────────────────────
export function LegalLinks({ onNavigate, style = {} }) {
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", ...style }}>
      <button
        onClick={() => onNavigate("privacy")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 11, color: TX3, fontFamily: "inherit", padding: 0,
          textDecoration: "underline",
        }}
      >
        Politique de Confidentialité
      </button>
      <button
        onClick={() => onNavigate("terms")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 11, color: TX3, fontFamily: "inherit", padding: 0,
          textDecoration: "underline",
        }}
      >
        Conditions d'Utilisation
      </button>
    </div>
  );
}
