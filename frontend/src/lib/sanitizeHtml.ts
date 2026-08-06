/**
 * Nettoyage du rich text éditorial côté client.
 *
 * Même liste blanche que `content/html.py` : l'aperçu d'import montre donc
 * exactement ce que la base retiendra, et le HTML produit par un LLM — qui a pu
 * lire une page web arbitraire — n'entre jamais tel quel dans le DOM.
 */

const ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "EM",
  "I",
  "LI",
  "OL",
  "P",
  "STRONG",
  "UL",
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  A: new Set(["href", "title"]),
};

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function isAllowedHref(value: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(value, "https://example.invalid").protocol);
  } catch {
    return false;
  }
}

/** Remplace un élément par ses enfants, comme le `strip=True` de bleach. */
function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function clean(node: Element): void {
  for (const child of Array.from(node.children)) {
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // `<script>` et consorts : on retire aussi leur contenu, qui n'est pas du
      // texte éditorial.
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE") {
        child.remove();
        continue;
      }
      clean(child);
      unwrap(child);
      continue;
    }

    const allowed = ALLOWED_ATTRIBUTES[child.tagName] ?? new Set<string>();
    for (const attribute of Array.from(child.attributes)) {
      if (!allowed.has(attribute.name)) child.removeAttribute(attribute.name);
    }
    if (child.tagName === "A" && !isAllowedHref(child.getAttribute("href") ?? "")) {
      child.removeAttribute("href");
    }

    clean(child);
  }
}

export function sanitizeEditorialHtml(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  if (typeof window === "undefined") return "";

  // `DOMParser` n'exécute rien et le document reste détaché : le HTML hostile
  // est inerte pendant tout le nettoyage.
  const doc = new DOMParser().parseFromString(`<div>${value}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  clean(root);
  return root.innerHTML;
}
