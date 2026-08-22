import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeEditorialHtml } from "./sanitizeHtml.ts";

/**
 * `sanitizeEditorialHtml` est écrit à la main : ces tests sont ce qui autorise à
 * lui faire confiance. Ils sont exécutables tels quels par `npm test` (Node sait
 * lire le TypeScript), sans ajouter de dépendance au projet.
 */

/** Motifs qui, présents en sortie, signeraient une injection réussie. */
const FORBIDDEN = [/<script/i, /<iframe/i, /\son\w+\s*=/i, /javascript:/i, /data:/i];

function assertInert(output: string): void {
  for (const pattern of FORBIDDEN) {
    assert.ok(!pattern.test(output), `sortie non inerte (${pattern}) : ${output}`);
  }
}

describe("liste blanche", () => {
  it("conserve les balises éditoriales", () => {
    const html =
      "<p>Un <strong>contrôle</strong> de la <em>kaliémie</em>.</p><ul><li>a</li></ul>";
    assert.equal(sanitizeEditorialHtml(html), html);
  });

  it("déballe les balises inconnues en gardant leur contenu", () => {
    assert.equal(
      sanitizeEditorialHtml("<div><span>texte</span></div>"),
      "texte"
    );
  });

  it("jette le contenu des balises qui ne portent pas de texte éditorial", () => {
    assert.equal(sanitizeEditorialHtml("<p>a</p><script>alert(1)</script>"), "<p>a</p>");
    assert.equal(sanitizeEditorialHtml("<style>body{}</style>b"), "b");
  });

  it("retire les commentaires et les déclarations", () => {
    assert.equal(sanitizeEditorialHtml("a<!-- caché -->b"), "ab");
    assert.equal(sanitizeEditorialHtml("<!doctype html><p>a</p>"), "<p>a</p>");
  });

  it("retire les attributs hors liste blanche", () => {
    assert.equal(
      sanitizeEditorialHtml('<p class="x" onclick="alert(1)">a</p>'),
      "<p>a</p>"
    );
    assert.equal(
      sanitizeEditorialHtml('<a href="https://x.fr" rel="me" onmouseover="alert(1)">l</a>'),
      '<a href="https://x.fr">l</a>'
    );
  });

  it("referme les balises vides", () => {
    assert.equal(sanitizeEditorialHtml("a<br>b"), "a<br />b");
  });
});

describe("protocoles d'URL", () => {
  it("garde les protocoles autorisés et les URL relatives", () => {
    for (const href of ["https://x.fr/a", "http://x.fr", "mailto:a@x.fr", "/interne"]) {
      assert.equal(
        sanitizeEditorialHtml(`<a href="${href}">l</a>`),
        `<a href="${href}">l</a>`
      );
    }
  });

  it("préserve les esperluettes des chaînes de requête", () => {
    assert.equal(
      sanitizeEditorialHtml('<a href="https://x.fr/?a=1&amp;b=2">l</a>'),
      '<a href="https://x.fr/?a=1&amp;b=2">l</a>'
    );
  });

  it("retire les href à protocole dangereux", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      const out = sanitizeEditorialHtml(`<a href="${href}">l</a>`);
      assert.equal(out, "<a>l</a>", `href non retiré : ${href}`);
    }
  });

  it("retire un href dont le schéma est masqué par des caractères de contrôle", () => {
    for (const href of ["java\tscript:alert(1)", "java\nscript:alert(1)", " javascript:alert(1)"]) {
      const out = sanitizeEditorialHtml(`<a href="${href}">l</a>`);
      assertInert(out);
      assert.equal(out, "<a>l</a>");
    }
  });

  it("neutralise un schéma reconstruit par une entité", () => {
    // Le `:` est encodé : c'est le navigateur qui le reformerait, après notre
    // validation. On décode donc avant de valider, et on ré-échappe le `&` en
    // sortie pour qu'aucune seconde lecture ne soit possible.
    for (const href of [
      "javascript&#58;alert(1)",
      "javascript&#x3a;alert(1)",
      "javascript&colon;alert(1)",
      "javascript&#58alert(1)",
    ]) {
      const out = sanitizeEditorialHtml(`<a href="${href}">l</a>`);
      assertInert(out);
      assert.equal(out, "<a>l</a>", `entité non neutralisée : ${href}`);
    }
  });

  it("ne laisse jamais une entité inconnue être redécodée par le navigateur", () => {
    // `&inconnue;` reste littérale à la validation ; son `&` est échappé, donc
    // le navigateur lira du texte, jamais une entité.
    const out = sanitizeEditorialHtml('<a href="javascript&inconnue;alert(1)">l</a>');
    assertInert(out);
    assert.ok(out.includes("&amp;inconnue;"), out);
  });
});

describe("mutation XSS", () => {
  it("ne laisse pas un attribut refermer sa balise", () => {
    const out = sanitizeEditorialHtml(
      '<p title="</p><script>alert(1)</script>">a</p>'
    );
    assertInert(out);
    assert.equal(out, '<p>a</p>'); // `title` n\'est pas autorisé sur `p`
  });

  it("ne laisse pas un attribut de lien injecter une balise", () => {
    // `onerror=` reste visible dans la sortie, mais comme texte d'un attribut
    // dont le guillemet et les chevrons sont échappés : le parseur du navigateur
    // n'y verra jamais une balise. C'est l'invariant « rien n'est recopié tel
    // quel » qui tient, pas une liste de motifs interdits.
    assert.equal(
      sanitizeEditorialHtml(
        '<a title=\'x"><img src=x onerror=alert(1)>\' href="https://x.fr">l</a>'
      ),
      '<a title="x&quot;&gt;&lt;img src=x onerror=alert(1)&gt;" href="https://x.fr">l</a>'
    );
  });

  it("échappe une balise ouvrante jamais refermée", () => {
    const out = sanitizeEditorialHtml('<p>a</p><a href="https://x.fr"');
    assertInert(out);
    assert.ok(out.startsWith("<p>a</p>&lt;a"), out);
  });

  it("échappe un chevron isolé", () => {
    assert.equal(sanitizeEditorialHtml("1 < 2 > 0"), "1 &lt; 2 &gt; 0");
  });

  it("retire les balises fermantes non autorisées", () => {
    // Sinon un `</div>` sorti tel quel refermerait le conteneur de la fiche.
    assert.equal(sanitizeEditorialHtml("a</div>b"), "ab");
  });

  it("ignore un doublon d'attribut", () => {
    assert.equal(
      sanitizeEditorialHtml('<a href="https://x.fr" href="javascript:alert(1)">l</a>'),
      '<a href="https://x.fr">l</a>'
    );
  });
});

describe("fidélité du texte", () => {
  it("laisse intactes les entités bien formées", () => {
    assert.equal(sanitizeEditorialHtml("<p>caf&eacute; &amp; th&#233;</p>"), "<p>caf&eacute; &amp; th&#233;</p>");
  });

  it("échappe une esperluette isolée", () => {
    assert.equal(sanitizeEditorialHtml("<p>Tom & Jerry</p>"), "<p>Tom &amp; Jerry</p>");
  });

  it("est idempotent", () => {
    const samples = [
      "<p>caf&eacute; &amp; th&#233;</p>",
      "<p>Tom & Jerry</p>",
      '<a href="https://x.fr/?a=1&amp;b=2">l</a>',
      "1 < 2",
      "a<br>b",
      "<div><script>alert(1)</script><p>a</p></div>",
    ];
    for (const sample of samples) {
      const once = sanitizeEditorialHtml(sample);
      assert.equal(sanitizeEditorialHtml(once), once, `non idempotent : ${sample}`);
    }
  });

  it("renvoie une chaîne vide pour les entrées non exploitables", () => {
    for (const value of [undefined, null, "", 42, {}]) {
      assert.equal(sanitizeEditorialHtml(value), "");
    }
  });
});
