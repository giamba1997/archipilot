// ── Sanitization HTML ────────────────────────────────────────
// Utilise DOMPurify pour nettoyer les inputs HTML que l'app rend via
// dangerouslySetInnerHTML (signatures email, corps de message PV/OPR).
//
// La regex artisanale précédente ne couvrait que <script> et on*=, en
// laissant passer <iframe>, javascript: URIs, <svg> avec scripts, etc.
//
// Profile EMAIL_RICH : autorise la mise en forme typique d'une signature
// (gras/italique/listes/liens/images inline base64), bloque tout le reste.
// Garde-fou supplémentaire : pas de <style>, pas de <script>, pas de
// scheme dangereux (javascript:, data: sauf data:image/*, vbscript:).

import DOMPurify from "dompurify";

const EMAIL_RICH_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "b", "i", "u", "strong", "em", "span", "div",
    "ul", "ol", "li",
    "a", "img",
    "blockquote", "pre", "code",
    "h1", "h2", "h3", "h4",
    "hr",
  ],
  ALLOWED_ATTR: [
    "href", "src", "alt", "title", "style", "class",
    "target", "rel",
  ],
  // data:image/* est légitime pour les logos collés ; on bloque les autres
  // schemes dangereux. http(s) et mailto: passent.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,)/i,
  // Force target=_blank rel=noopener pour tout <a> — protège contre tabnabbing
  ADD_ATTR: ["target"],
};

// Hook DOMPurify pour appliquer rel=noopener noreferrer sur tous les liens
// (protection contre tabnabbing — un lien malveillant pourrait sinon
// piloter la fenêtre parente via window.opener).
let hookInstalled = false;
function ensureHooks() {
  if (hookInstalled) return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  hookInstalled = true;
}

/**
 * Nettoie un HTML "riche" type signature email ou corps de message.
 * Bloque scripts, iframes, schemes dangereux, event handlers.
 * Préserve mise en forme typographique + images inline base64.
 */
export function sanitizeEmailHtml(dirty) {
  if (!dirty || typeof dirty !== "string") return "";
  ensureHooks();
  return DOMPurify.sanitize(dirty, EMAIL_RICH_CONFIG);
}

/**
 * Nettoie un HTML "minimal" — uniquement gras / italique / liens.
 * Pour les contextes où l'utilisateur ne devrait pas pouvoir mettre
 * d'images / listes (ex: nom de chantier).
 */
export function sanitizeMinimalHtml(dirty) {
  if (!dirty || typeof dirty !== "string") return "";
  ensureHooks();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ["b", "i", "u", "strong", "em", "a"],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}
