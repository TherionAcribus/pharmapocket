"""Amorce `CategoryMaladies.domain` à partir du nom/slug des catégories existantes.

Le domaine était jusqu'ici deviné à chaque rendu par une heuristique côté client
(`inferDomainFromPathologySlug`), forcément incomplète. On fait tourner une
heuristique équivalente — mais élargie — une seule fois ici, pour que l'arbre
parte avec des valeurs plausibles ; les éditeurs corrigent ensuite dans Wagtail,
et plus rien ne devine à l'exécution.

La table de correspondance est volontairement recopiée dans la migration plutôt
qu'importée : une migration doit rester figée dans le temps.
"""

import unicodedata

from django.db import migrations

# Radicaux cherchés dans « nom + slug » normalisés, premier trouvé gagnant.
# L'ordre compte : les radicaux les plus spécifiques passent en premier pour que
# « mycose vaginale » aille en urogyneco et pas en dermato.
KEYWORD_RULES = [
    # Termes composés / ambigus, à trancher avant les radicaux génériques.
    ("angine-de-poitrine", "cardio"),
    ("mycose-vaginal", "urogyneco"),
    ("candidose-vaginal", "urogyneco"),
    ("infection-urinaire", "urogyneco"),
    ("gastro-enterite", "gastro"),
    ("hepatite", "gastro"),
    # Infectiologie
    ("infectio", "infectio"),
    ("grippe", "infectio"),
    ("covid", "infectio"),
    ("zona", "infectio"),
    ("herpes", "infectio"),
    ("varicelle", "infectio"),
    ("rougeole", "infectio"),
    ("meningite", "infectio"),
    ("tuberculose", "infectio"),
    ("paludisme", "infectio"),
    ("vih", "infectio"),
    ("sida", "infectio"),
    ("septicemie", "infectio"),
    # Cardiologie / vasculaire
    ("cardio", "cardio"),
    ("cardite", "cardio"),
    ("cardiaque", "cardio"),
    ("myocarde", "cardio"),
    ("infarctus", "cardio"),
    ("angor", "cardio"),
    ("hypertension", "cardio"),
    ("arteriel", "cardio"),
    ("atheros", "cardio"),
    ("thrombose", "cardio"),
    ("phlebite", "cardio"),
    ("embolie", "cardio"),
    ("varice", "cardio"),
    ("arythmie", "cardio"),
    ("fibrillation", "cardio"),
    ("avc", "cardio"),
    ("cholesterol", "cardio"),
    ("dyslipid", "cardio"),
    # Endocrinologie / métabolisme
    ("endocrin", "endocrino"),
    ("diabet", "endocrino"),
    ("thyroid", "endocrino"),
    ("hypothyro", "endocrino"),
    ("hyperthyro", "endocrino"),
    ("goitre", "endocrino"),
    ("obesite", "endocrino"),
    ("surrenal", "endocrino"),
    ("metabol", "endocrino"),
    ("goutte", "endocrino"),
    # Neurologie / psychiatrie
    ("neuro", "neuro"),
    ("psychiatr", "neuro"),
    ("migraine", "neuro"),
    ("cephalee", "neuro"),
    ("epilepsie", "neuro"),
    ("parkinson", "neuro"),
    ("alzheimer", "neuro"),
    ("demence", "neuro"),
    ("sclerose-en-plaques", "neuro"),
    ("depress", "neuro"),
    ("anxiete", "neuro"),
    ("insomnie", "neuro"),
    ("addiction", "neuro"),
    ("sevrage", "neuro"),
    ("schizophr", "neuro"),
    ("bipolaire", "neuro"),
    # Pneumologie / ORL
    ("pneumo", "pneumo"),
    ("asthme", "pneumo"),
    ("bpco", "pneumo"),
    ("bronch", "pneumo"),
    ("toux", "pneumo"),
    ("rhinite", "pneumo"),
    ("rhinopharyngite", "pneumo"),
    ("sinusite", "pneumo"),
    ("angine", "pneumo"),
    ("otite", "pneumo"),
    ("laryngite", "pneumo"),
    ("apnee", "pneumo"),
    ("orl", "pneumo"),
    ("respiratoire", "pneumo"),
    ("allergie", "pneumo"),
    # Gastro-entérologie / hépatologie
    ("gastro", "gastro"),
    ("hepat", "gastro"),
    ("reflux", "gastro"),
    ("rgo", "gastro"),
    ("ulcere-gastr", "gastro"),
    ("constipation", "gastro"),
    ("diarrhee", "gastro"),
    ("colopathie", "gastro"),
    ("colite", "gastro"),
    ("crohn", "gastro"),
    ("hemorroide", "gastro"),
    ("nausee", "gastro"),
    ("cirrhose", "gastro"),
    ("pancreat", "gastro"),
    ("intestin", "gastro"),
    ("digestif", "gastro"),
    # Dermatologie
    ("dermat", "dermato"),
    ("eczema", "dermato"),
    ("psoriasis", "dermato"),
    ("acne", "dermato"),
    ("urticaire", "dermato"),
    ("mycose", "dermato"),
    ("verrue", "dermato"),
    ("brulure", "dermato"),
    ("plaie", "dermato"),
    ("cicatri", "dermato"),
    ("poux", "dermato"),
    ("gale", "dermato"),
    ("peau", "dermato"),
    # Rhumatologie / douleur
    ("rhumato", "rhumato"),
    ("arthrose", "rhumato"),
    ("arthrite", "rhumato"),
    ("osteoporose", "rhumato"),
    ("tendinite", "rhumato"),
    ("lombalgie", "rhumato"),
    ("sciatique", "rhumato"),
    ("entorse", "rhumato"),
    ("fibromyalgie", "rhumato"),
    ("douleur", "rhumato"),
    ("articulaire", "rhumato"),
    # Urologie / gynécologie
    ("urolog", "urogyneco"),
    ("gyneco", "urogyneco"),
    ("cystite", "urogyneco"),
    ("prostate", "urogyneco"),
    ("incontinence", "urogyneco"),
    ("contracept", "urogyneco"),
    ("menopause", "urogyneco"),
    ("grossesse", "urogyneco"),
    ("allaitement", "urogyneco"),
    ("endometriose", "urogyneco"),
    ("renal", "urogyneco"),
    ("calcul-urinaire", "urogyneco"),
    # Oncologie / hématologie
    ("oncolog", "onco"),
    ("cancer", "onco"),
    ("tumeur", "onco"),
    ("chimiotherapie", "onco"),
    ("leucemie", "onco"),
    ("lymphome", "onco"),
    ("hematolog", "onco"),
    ("anemie", "onco"),
    ("hemophilie", "onco"),
    # Ophtalmologie / stomatologie
    ("ophtalmo", "ophtalmo"),
    ("conjonctivite", "ophtalmo"),
    ("glaucome", "ophtalmo"),
    ("cataracte", "ophtalmo"),
    ("secheresse-oculaire", "ophtalmo"),
    ("oculaire", "ophtalmo"),
    ("dentaire", "ophtalmo"),
    ("aphte", "ophtalmo"),
    ("gingivite", "ophtalmo"),
    # Signaux faibles d'infectiologie : ils ne doivent pas l'emporter sur un
    # organe déjà identifié (« angine bactérienne » est ORL, pas infectiologie).
    ("antibio", "infectio"),
    ("antiviral", "infectio"),
    ("vaccin", "infectio"),
    ("parasit", "infectio"),
    ("virale", "infectio"),
    ("virus", "infectio"),
    ("bacterie", "infectio"),
    ("bacterien", "infectio"),
    ("infection", "infectio"),
    ("infectieu", "infectio"),
]


def _normalize(value: str) -> str:
    """« Péricardite aiguë » → « pericardite-aigue »."""
    decomposed = unicodedata.normalize("NFD", value or "")
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    out = []
    for char in stripped.lower():
        out.append(char if char.isalnum() else "-")
    return "-".join(part for part in "".join(out).split("-") if part)


def _guess_domain(name: str, slug: str) -> str:
    haystack = f"{_normalize(name)}-{_normalize(slug)}"
    tokens = set(haystack.split("-"))
    for stem, domain in KEYWORD_RULES:
        # Les radicaux courts (« avc », « orl », « gale »…) ne sont cherchés que
        # comme mots entiers : en sous-chaîne ils accrocheraient n'importe quoi.
        matched = stem in tokens if len(stem) <= 4 else stem in haystack
        if matched:
            return domain
    return ""


def backfill(apps, schema_editor):
    CategoryMaladies = apps.get_model("content", "CategoryMaladies")

    updated = []
    for node in CategoryMaladies.objects.filter(domain="").only("id", "name", "slug", "domain"):
        domain = _guess_domain(node.name, node.slug)
        if not domain:
            continue
        node.domain = domain
        updated.append(node)

    if updated:
        CategoryMaladies.objects.bulk_update(updated, ["domain"], batch_size=200)


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0029_categorymaladies_domain"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
