/**
 * Nettoyage du rich text éditorial côté client.
 *
 * Même liste blanche que `content/html.py` : l'aperçu d'import montre donc
 * exactement ce que la base retiendra, et le HTML produit par un LLM — qui a pu
 * lire une page web arbitraire — n'entre jamais tel quel dans le DOM.
 *
 * Deux implémentations partagent cette liste blanche :
 *
 * - `sanitizeEditorialHtml` est isomorphe (serveur et navigateur, sortie
 *   identique au caractère près) et sert au rendu. Les fiches sont rendues côté
 *   serveur : une version qui ne saurait nettoyer que dans le navigateur y
 *   laisserait passer le HTML brut au SSR, et provoquerait en prime un mismatch
 *   d'hydratation.
 * - `sanitizeEditorialHtmlWithDom` s'appuie sur le parseur du navigateur. Elle
 *   est réservée à l'aperçu d'import, seul endroit où ce nettoyage est l'unique
 *   barrière (le JSON n'a pas encore traversé `sanitize_rich_text`) et où le DOM
 *   est garanti disponible.
 */

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "em",
  "i",
  "li",
  "ol",
  "p",
  "strong",
  "ul",
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
};

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Balises sans contenu, à refermer dans la sérialisation. */
const VOID_TAGS = new Set(["br"]);

/**
 * Balises dont on jette aussi le contenu : ce n'est pas du texte éditorial, et
 * le laisser passer en clair afficherait du code au lecteur.
 */
const DROPPED_CONTENT_TAGS = new Set(["script", "style"]);

/** Attributs porteurs d'une URL, soumis à la liste blanche de protocoles. */
const URL_ATTRIBUTES = new Set(["href"]);

/** Base arbitraire : elle ne sert qu'à donner un protocole aux URL relatives. */
const RELATIVE_URL_BASE = "https://pharmapocket.invalid/";

function isAllowedProtocol(value: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(value, RELATIVE_URL_BASE).protocol);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Implémentation isomorphe                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Entités nommées reconnues au décodage des URL.
 *
 * La table est volontairement courte : elle ne vise pas l'exhaustivité mais les
 * caractères capables de changer le sens d'une URL (`:` au premier chef). Une
 * entité absente reste littérale et sera de toute façon ré-échappée à la
 * sortie — le navigateur ne pourra donc jamais la redécoder. Ne pas connaître
 * une entité n'ouvre aucune brèche ; cela abîme au pire un lien exotique.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  AMP: "&",
  lt: "<",
  LT: "<",
  gt: ">",
  GT: ">",
  quot: '"',
  QUOT: '"',
  apos: "'",
  nbsp: " ",
  colon: ":",
  semi: ";",
  sol: "/",
  bsol: "\\",
  num: "#",
  quest: "?",
  excl: "!",
  period: ".",
  comma: ",",
  equals: "=",
  lpar: "(",
  rpar: ")",
  commat: "@",
  dollar: "$",
  percnt: "%",
  plus: "+",
  ast: "*",
  lsqb: "[",
  rsqb: "]",
  lowbar: "_",
  verbar: "|",
  grave: "`",
  Tab: "\t",
  NewLine: "\n",
};

/**
 * Référence de caractère bien formée. Le point-virgule final est facultatif :
 * les navigateurs décodent `&#58` comme `&#58;`, et sur-décoder ne fait ici que
 * rendre la validation d'URL plus stricte.
 */
const ENTITY_REFERENCE =
  /&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,30});?/g;

/** Même motif, point-virgule obligatoire : sert à *préserver* une entité. */
const WELL_FORMED_ENTITY =
  /&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,30});/;

function decodeEntities(value: string): string {
  return value.replace(ENTITY_REFERENCE, (match, body: string) => {
    if (body[0] !== "#") {
      const named = NAMED_ENTITIES[body];
      return named === undefined ? match : named;
    }

    const hex = body[1] === "x" || body[1] === "X";
    const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
    try {
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  });
}

/**
 * Échappe le texte et les attributs non-URL en laissant passer les entités déjà
 * bien formées, pour ne pas transformer `&eacute;` en « &eacute; » à l'écran.
 *
 * C'est sans risque : une référence de caractère est décodée *après* le
 * découpage des balises et des attributs, elle ne peut donc produire ni balise
 * ni guillemet fermant — seulement un caractère dans un nœud texte.
 */
function escapePreservingEntities(value: string, quotes: boolean): string {
  const specials = quotes ? '["<>&]' : "[<>&]";
  const scanner = new RegExp(`${WELL_FORMED_ENTITY.source}|${specials}`, "g");
  return value.replace(scanner, (match) => {
    switch (match) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return match; // entité bien formée, laissée intacte
    }
  });
}

/**
 * Échappe une URL déjà décodée et validée. Le `&` est échappé sans condition :
 * le navigateur relira donc exactement la chaîne qu'on a validée, ce qui ferme
 * la double lecture du type `javascript&#58;alert(1)`.
 */
function escapeUrl(value: string): string {
  return value.replace(/[&<>"]/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return "&quot;";
    }
  });
}

/**
 * Renvoie l'URL décodée si son protocole est autorisé, `null` sinon.
 *
 * La validation porte sur une variante purgée de ses blancs et caractères de
 * contrôle, que les navigateurs ignorent au moment de lire le schéma :
 * `java\tscript:x` doit être rejeté comme `javascript:x`.
 */
function safeUrl(rawValue: string): string | null {
  const decoded = decodeEntities(rawValue);
  const probe = decoded.replace(/[\u0000-\u0020\u007f]/g, "");
  if (!probe) return null;
  return isAllowedProtocol(probe) ? decoded : null;
}

type Attribute = { name: string; value: string };

type StartTag = {
  name: string;
  attributes: Attribute[];
  end: number;
};

const TAG_NAME_END = /[\s/>]/;
const ATTRIBUTE_NAME_END = /[\s/>=]/;

/**
 * Lit une balise ouvrante à partir du caractère suivant `<`.
 *
 * Renvoie `null` si la balise n'est pas refermée avant la fin de l'entrée :
 * l'appelant traite alors le `<` comme du texte, ce qui échappe le reste au lieu
 * de le laisser filer.
 */
function readStartTag(input: string, start: number): StartTag | null {
  let i = start;
  while (i < input.length && !TAG_NAME_END.test(input[i])) i += 1;
  const name = input.slice(start, i).toLowerCase();
  if (!name) return null;

  const attributes: Attribute[] = [];
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i += 1;
    if (i >= input.length) return null;

    if (input[i] === ">") return { name, attributes, end: i + 1 };
    if (input[i] === "/") {
      i += 1;
      continue;
    }

    const nameStart = i;
    while (i < input.length && !ATTRIBUTE_NAME_END.test(input[i])) i += 1;
    const attributeName = input.slice(nameStart, i).toLowerCase();
    if (!attributeName) return null;

    while (i < input.length && /\s/.test(input[i])) i += 1;
    if (input[i] !== "=") {
      attributes.push({ name: attributeName, value: "" });
      continue;
    }

    i += 1;
    while (i < input.length && /\s/.test(input[i])) i += 1;
    if (i >= input.length) return null;

    const quote = input[i];
    if (quote === '"' || quote === "'") {
      const close = input.indexOf(quote, i + 1);
      if (close === -1) return null;
      attributes.push({ name: attributeName, value: input.slice(i + 1, close) });
      i = close + 1;
      continue;
    }

    const valueStart = i;
    while (i < input.length && !/[\s>]/.test(input[i])) i += 1;
    attributes.push({ name: attributeName, value: input.slice(valueStart, i) });
  }

  return null;
}

function serializeStartTag(tag: StartTag): string {
  const allowed = ALLOWED_ATTRIBUTES[tag.name];
  const parts: string[] = [tag.name];

  if (allowed) {
    const seen = new Set<string>();
    for (const attribute of tag.attributes) {
      if (!allowed.has(attribute.name) || seen.has(attribute.name)) continue;

      if (URL_ATTRIBUTES.has(attribute.name)) {
        const url = safeUrl(attribute.value);
        if (url === null) continue;
        seen.add(attribute.name);
        parts.push(`${attribute.name}="${escapeUrl(url)}"`);
        continue;
      }

      seen.add(attribute.name);
      parts.push(
        `${attribute.name}="${escapePreservingEntities(attribute.value, true)}"`
      );
    }
  }

  const open = parts.join(" ");
  return VOID_TAGS.has(tag.name) ? `<${open} />` : `<${open}>`;
}

/** Saute le contenu brut d'une balise dont on jette tout, jusqu'à sa fermeture. */
function skipDroppedContent(input: string, from: number, name: string): number {
  const closing = new RegExp(`</${name}\\s*>`, "i");
  const match = closing.exec(input.slice(from));
  return match ? from + match.index + match[0].length : input.length;
}

/**
 * Nettoie le HTML éditorial sans dépendre du DOM.
 *
 * L'invariant de sûreté tient en une phrase : **rien du source n'est recopié tel
 * quel**. Chaque caractère sortant est soit du texte ré-échappé, soit une balise
 * de la liste blanche reconstruite depuis zéro. Une erreur du découpeur peut
 * donc abîmer l'affichage, jamais produire de balise injectée.
 *
 * Les balises inconnues sont retirées en gardant leur contenu, comme le
 * `strip=True` de bleach.
 */
export function sanitizeEditorialHtml(value: unknown): string {
  if (typeof value !== "string" || !value) return "";

  const out: string[] = [];
  let i = 0;

  while (i < value.length) {
    const lt = value.indexOf("<", i);
    if (lt === -1) {
      out.push(escapePreservingEntities(value.slice(i), false));
      break;
    }
    if (lt > i) out.push(escapePreservingEntities(value.slice(i, lt), false));

    const next = value[lt + 1];

    // Commentaires et déclarations : retirés, comme `strip_comments=True`.
    if (next === "!" || next === "?") {
      if (value.startsWith("<!--", lt)) {
        const close = value.indexOf("-->", lt + 4);
        i = close === -1 ? value.length : close + 3;
        continue;
      }
      const close = value.indexOf(">", lt + 1);
      i = close === -1 ? value.length : close + 1;
      continue;
    }

    if (next === "/") {
      const close = value.indexOf(">", lt + 2);
      if (close === -1) {
        out.push("&lt;");
        i = lt + 1;
        continue;
      }
      const name = value.slice(lt + 2, close).trim().toLowerCase();
      if (ALLOWED_TAGS.has(name) && !VOID_TAGS.has(name)) out.push(`</${name}>`);
      i = close + 1;
      continue;
    }

    const tag = next && /[a-zA-Z]/.test(next) ? readStartTag(value, lt + 1) : null;
    if (!tag) {
      out.push("&lt;");
      i = lt + 1;
      continue;
    }

    if (DROPPED_CONTENT_TAGS.has(tag.name)) {
      i = skipDroppedContent(value, tag.end, tag.name);
      continue;
    }

    if (ALLOWED_TAGS.has(tag.name)) out.push(serializeStartTag(tag));
    i = tag.end;
  }

  return out.join("");
}

/* -------------------------------------------------------------------------- */
/* Implémentation appuyée sur le DOM                                          */
/* -------------------------------------------------------------------------- */

/** Remplace un élément par ses enfants, comme le `strip=True` de bleach. */
function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

function clean(node: Element): void {
  for (const child of Array.from(node.children)) {
    const name = child.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(name)) {
      // `<script>` et consorts : on retire aussi leur contenu, qui n'est pas du
      // texte éditorial.
      if (DROPPED_CONTENT_TAGS.has(name)) {
        child.remove();
        continue;
      }
      clean(child);
      unwrap(child);
      continue;
    }

    const allowed = ALLOWED_ATTRIBUTES[name] ?? new Set<string>();
    for (const attribute of Array.from(child.attributes)) {
      if (!allowed.has(attribute.name)) child.removeAttribute(attribute.name);
    }
    for (const attribute of URL_ATTRIBUTES) {
      const raw = child.getAttribute(attribute);
      if (raw !== null && !isAllowedProtocol(raw)) child.removeAttribute(attribute);
    }

    clean(child);
  }
}

/**
 * Variante fondée sur le parseur du navigateur, réservée à l'aperçu d'import :
 * c'est le seul écran où ce nettoyage est la seule barrière, le JSON n'ayant pas
 * encore traversé `sanitize_rich_text`.
 */
export function sanitizeEditorialHtmlWithDom(value: unknown): string {
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
