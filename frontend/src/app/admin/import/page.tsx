"use client";

import * as React from "react";

import { MobileScaffold } from "@/components/MobileScaffold";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useImportCards } from "@/lib/queries";
import type { AdminCardImportReport } from "@/lib/types";
import { useStaffGuard } from "@/lib/staffGuard";

const PLACEHOLDER = `[
  {
    "title": "Quand contrôler la kaliémie après instauration d'un IEC ?",
    "card_type": "standard",
    "answer_express": "<p>Un contrôle de la <b>kaliémie</b> et de la créatinine s'impose <b>7 à 14 jours</b> après l'instauration.</p>",
    "categories_theme": ["cardiologie"],
    "sources": [
      { "source": { "name": "Bon usage des IEC", "kind": "institutional", "publisher": "ANSM", "url": "https://..." } }
    ]
  }
]`;

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function ResultCard({ result }: { result: AdminCardImportReport["results"][number] }) {
  const label = result.title || result.slug || `Carte #${result.index + 1}`;

  return (
    <div
      className={`rounded-lg border p-3 ${result.ok ? "bg-background" : "border-destructive/40 bg-destructive/5"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium leading-snug">{label}</div>
        <div className="shrink-0 text-xs text-muted-foreground">#{result.index + 1}</div>
      </div>

      {result.ok ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {result.card_type} · {result.status === "published" ? "publiée" : "brouillon"}
          {result.id ? ` · id ${result.id}` : ""}
          {result.slug ? ` · ${result.slug}` : ""}
          {result.subject ? ` · sujet « ${result.subject} »` : ""}
        </div>
      ) : null}

      {result.ok && (result.created_sources?.length || result.created_questions) ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {result.created_sources?.length
            ? `Sources créées : ${result.created_sources.join(", ")}. `
            : ""}
          {result.created_questions
            ? `${result.created_questions} question(s) créée(s).`
            : ""}
        </div>
      ) : null}

      {result.errors.length ? (
        <ul className="mt-2 space-y-1 text-sm text-destructive">
          {result.errors.map((error, i) => (
            <li key={i}>✗ {error}</li>
          ))}
        </ul>
      ) : null}

      {result.warnings.length ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {result.warnings.map((warning, i) => (
            <li key={i}>! {warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function AdminImportPage() {
  const { checking } = useStaffGuard();
  const importMutation = useImportCards();

  const [raw, setRaw] = React.useState("");
  const [publish, setPublish] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<AdminCardImportReport | null>(null);

  const busy = importMutation.isPending;

  const run = async (dryRun: boolean) => {
    setError(null);
    setReport(null);

    let cards: unknown;
    try {
      cards = JSON.parse(raw);
    } catch (e: unknown) {
      // Le JSON collé est la première source d'erreur : on la distingue des
      // erreurs éditoriales, qui viennent du serveur.
      setError(`JSON invalide : ${toErrorMessage(e)}`);
      return;
    }

    try {
      setReport(await importMutation.mutateAsync({ cards, publish, dry_run: dryRun }));
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    }
  };

  return (
    <MobileScaffold title="Admin — Import de fiches" contentClassName="space-y-4">
      {checking ? <div className="text-sm text-muted-foreground">Vérification…</div> : null}

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">JSON généré</div>
        <p className="text-xs text-muted-foreground">
          Une carte ou une liste de cartes, au format décrit dans{" "}
          <code>docs/prompt_generation_cartes.md</code>. L&apos;import est tout-ou-rien : une carte
          en erreur annule le lot.
        </p>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          rows={16}
          disabled={busy}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-md border bg-transparent p-3 font-mono text-xs shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
        />

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={publish}
            onCheckedChange={(v) => setPublish(v === true)}
            disabled={busy}
          />
          Publier directement (sinon les fiches sont créées en brouillon)
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void run(true)}
            disabled={busy || !raw.trim()}
          >
            {busy ? "…" : "Vérifier (sans écrire)"}
          </Button>
          <Button type="button" onClick={() => void run(false)} disabled={busy || !raw.trim()}>
            {busy ? "Import…" : "Importer"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-md border bg-destructive/5 p-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      {report ? (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="text-sm font-semibold">
            {report.ok
              ? report.dry_run
                ? "JSON valide — rien n'a été écrit"
                : `${report.imported ?? 0} fiche(s) importée(s)`
              : "Import refusé — rien n'a été écrit"}
          </div>

          {report.detail ? (
            <div className="text-sm text-destructive">{report.detail}</div>
          ) : null}

          <div className="grid gap-2">
            {report.results.map((result) => (
              <ResultCard key={result.index} result={result} />
            ))}
          </div>

          {report.ok && !report.dry_run ? (
            <p className="text-xs text-muted-foreground">
              Les fiches restent modifiables dans Wagtail ({report.published
                ? "publiées"
                : "en brouillon, à publier depuis le CMS"}
              ).
            </p>
          ) : null}
        </div>
      ) : null}
    </MobileScaffold>
  );
}
