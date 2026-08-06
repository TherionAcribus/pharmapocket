"""Importe des fiches générées par IA depuis un fichier JSON.

    python manage.py import_cards fiches.json --dry-run
    python manage.py import_cards fiches.json --publish

Le fichier contient soit une carte, soit une liste de cartes, soit
``{"cards": [...]}``. Le format est décrit dans
``docs/prompt_generation_cartes.md``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from content.importers import import_cards


class Command(BaseCommand):
    help = "Importe des fiches (micro-articles) depuis un JSON éditorial."

    def add_arguments(self, parser):
        parser.add_argument("path", help="Fichier JSON (« - » pour lire stdin).")
        parser.add_argument(
            "--publish",
            action="store_true",
            help="Publie les fiches au lieu de les créer en brouillon.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Valide tout puis annule la transaction : rien n'est écrit.",
        )
        parser.add_argument(
            "--no-create-sources",
            action="store_true",
            help="Échoue si une source citée n'existe pas déjà en base.",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Réécrit la fiche existante au même slug au lieu de refuser le lot.",
        )

    def handle(self, *args, **options):
        path = options["path"]
        raw = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise CommandError(f"JSON invalide : {exc}") from exc

        report = import_cards(
            payload,
            publish=options["publish"],
            dry_run=options["dry_run"],
            create_sources=not options["no_create_sources"],
            on_existing="update" if options["update"] else "error",
        )

        if report.get("detail"):
            raise CommandError(report["detail"])

        for result in report["results"]:
            label = f"[{result['index']}] {result.get('title') or result.get('slug') or '—'}"
            if result["ok"]:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{label} → {result['action']} id={result['id']} "
                        f"slug={result['slug']} ({result['status']})"
                    )
                )
            else:
                self.stdout.write(self.style.ERROR(label))
                for error in result["errors"]:
                    # Console Windows en cp1252 : pas de symbole hors ASCII ici.
                    self.stdout.write(self.style.ERROR(f"    ERREUR  {error}"))
            for warning in result.get("warnings", []):
                self.stdout.write(self.style.WARNING(f"    ATTENTION  {warning}"))

        if not report["ok"]:
            raise CommandError("Import annulé : aucune fiche n'a été créée.")

        if report["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry-run : transaction annulée, rien n'a été écrit."))
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"{report['imported']} fiche(s) importée(s), dont {report['updated']} mise(s) à jour."
                )
            )
