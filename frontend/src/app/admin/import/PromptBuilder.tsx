"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTags, useTaxonomyTree } from "@/lib/queries";
import { buildCardPrompt, type PromptSource } from "@/lib/promptTemplate";
import { useLocalDraft } from "@/lib/useLocalDraft";

const FIELD_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-md border bg-transparent p-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

const DRAFT_KEY = "pharmapocket:admin-import:prompt";

const EMPTY_DRAFT: { information: string; cardCount: string; source: PromptSource } = {
  information: "",
  cardCount: "",
  source: { name: "", publisher: "", url: "", publicationDate: "", content: "" },
};

/**
 * Assemble le prompt à coller dans le LLM. Les quatre taxonomies sont injectées
 * telles qu'elles existent en base : c'est ce qui permet au modèle de recopier
 * des slugs valides, et de ne proposer un nom nouveau qu'à bon escient.
 */
export function PromptBuilder({ enabled }: { enabled: boolean }) {
  const theme = useTaxonomyTree("theme", enabled);
  const maladies = useTaxonomyTree("maladies", enabled);
  const medicament = useTaxonomyTree("medicament", enabled);
  const pharmacologie = useTaxonomyTree("pharmacologie", enabled);
  const tags = useTags();

  const [draft, setDraft, clearDraft] = useLocalDraft(DRAFT_KEY, EMPTY_DRAFT);
  const { information, cardCount, source } = draft;
  const [copied, setCopied] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);

  const setInformation = (value: string) => setDraft((d) => ({ ...d, information: value }));
  const setCardCount = (value: string) => setDraft((d) => ({ ...d, cardCount: value }));
  const setSourceField = (field: keyof PromptSource) => (value: string) =>
    setDraft((d) => ({ ...d, source: { ...d.source, [field]: value } }));

  const loading =
    theme.isPending ||
    maladies.isPending ||
    medicament.isPending ||
    pharmacologie.isPending ||
    tags.isPending;

  const prompt = React.useMemo(
    () =>
      buildCardPrompt({
        information,
        cardCount,
        source,
        taxonomies: {
          theme: theme.data?.tree ?? [],
          maladies: maladies.data?.tree ?? [],
          medicament: medicament.data?.tree ?? [],
          pharmacologie: pharmacologie.data?.tree ?? [],
        },
        tags: (tags.data ?? []).map((tag) => tag.name),
      }),
    [
      information,
      cardCount,
      source,
      theme.data,
      maladies.data,
      medicament.data,
      pharmacologie.data,
      tags.data,
    ]
  );

  const onCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="text-sm font-semibold">1 · Générer le prompt</div>
      <p className="text-xs text-muted-foreground">
        Les catégories et les tags existants sont injectés automatiquement. Colle le
        contenu de la source : le modèle n&apos;a pas forcément accès à l&apos;URL, et le
        prompt lui interdit alors d&apos;inventer.
      </p>

      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="prompt-information">
          Information à faire passer
        </label>
        <textarea
          id="prompt-information"
          value={information}
          onChange={(e) => setInformation(e.target.value)}
          rows={3}
          placeholder="Ce que l'utilisateur doit retenir, en une ou deux phrases."
          className={FIELD_CLASS}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="prompt-source-name">
            Intitulé de la source
          </label>
          <Input
            id="prompt-source-name"
            value={source.name}
            onChange={(e) => setSourceField("name")(e.target.value)}
            placeholder="Bon usage des IEC"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="prompt-source-publisher">
            Éditeur / organisme
          </label>
          <Input
            id="prompt-source-publisher"
            value={source.publisher}
            onChange={(e) => setSourceField("publisher")(e.target.value)}
            placeholder="ANSM, HAS, Le Moniteur…"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="prompt-source-url">
            URL
          </label>
          <Input
            id="prompt-source-url"
            value={source.url}
            onChange={(e) => setSourceField("url")(e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="prompt-source-date">
            Date de publication
          </label>
          <Input
            id="prompt-source-date"
            value={source.publicationDate}
            onChange={(e) => setSourceField("publicationDate")(e.target.value)}
            placeholder="AAAA-MM-JJ"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="prompt-source-content">
          Contenu de la source (recommandé)
        </label>
        <textarea
          id="prompt-source-content"
          value={source.content}
          onChange={(e) => setSourceField("content")(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder="Coller ici le texte de l'article, de la recommandation ou du chapitre."
          className={`${FIELD_CLASS} font-mono text-xs`}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="prompt-card-count">
          Nombre de fiches souhaité (optionnel)
        </label>
        <Input
          id="prompt-card-count"
          value={cardCount}
          onChange={(e) => setCardCount(e.target.value)}
          placeholder="ex : 3 fiches détails et 1 récap"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void onCopy()} disabled={loading}>
          {loading ? "Chargement des catégories…" : copied ? "Copié !" : "Copier le prompt"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? "Masquer" : "Aperçu"}
        </Button>
        <Button type="button" variant="ghost" onClick={clearDraft}>
          Vider
        </Button>
        <span className="text-xs text-muted-foreground">Brouillon conservé sur ce navigateur.</span>
      </div>

      {showPreview ? (
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-[11px] whitespace-pre-wrap">
          {prompt}
        </pre>
      ) : null}
    </div>
  );
}
