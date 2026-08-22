import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import ReaderClient from "./ReaderClient";
import { isApiError } from "@/lib/api/client";
import { fetchMicroArticle } from "@/lib/api/content";

/**
 * Durée de mise en cache du détail lu sans session, côté Next.
 *
 * Cette réponse-là est mutualisée entre tous les visiteurs anonymes : une fiche
 * corrigée dans Wagtail doit donc s'y propager vite, d'où une minute plutôt
 * qu'un quart d'heure. C'est déjà largement assez pour absorber ce qui coûte —
 * les rafales de préchargement au swipe et les arrivées répétées depuis les
 * moteurs de recherche sur les fiches populaires — sachant que la vue de détail
 * n'est pas une simple lecture de ligne : elle assemble le sujet, les fiches
 * frères, la carte récap et assainit tout le HTML riche à chaque appel.
 *
 * Alignée sur le `max-age` du `Cache-Control` renvoyé par l'API pour les
 * requêtes anonymes (`_ANONYMOUS_DETAIL_MAX_AGE` dans
 * `backend/content/views/feed.py`) : le cache de données de Next n'obéit pas
 * aux en-têtes HTTP amont, il faut donc redire ici ce que le serveur annonce.
 */
const ANONYMOUS_REVALIDATE_SECONDS = 60;

/**
 * Politique de fetch serveur du détail, selon qu'une session accompagne ou non
 * la requête.
 *
 * Avec session : on relaie le cookie, sans quoi l'API voit une requête anonyme
 * et omet `is_saved` / `is_read` — le lecteur devrait alors les redemander
 * carte par carte côté client. On ne transmet que le cookie de session, le
 * reste des cookies du front n'ayant rien à faire dans un appel API. Et surtout
 * pas de cache : la réponse porte l'état personnel de *cet* utilisateur.
 *
 * Sans session : la réponse ne contient plus rien de personnel — `is_saved` et
 * `is_read` ne sont même pas sérialisés — elle est donc identique pour tous les
 * visiteurs anonymes et peut être mutualisée dans le cache de données de Next.
 * Les deux cas produisent des entrées de cache distinctes (l'en-tête `cookie`
 * fait partie de la clé), et le cas connecté n'en produit aucune : aucun risque
 * de servir l'état d'un compte à quelqu'un d'autre.
 */
async function detailFetchInit(): Promise<RequestInit> {
  const session = (await cookies()).get("sessionid");
  if (!session) {
    return { cache: "force-cache", next: { revalidate: ANONYMOUS_REVALIDATE_SECONDS } };
  }
  return { headers: { cookie: `sessionid=${session.value}` }, cache: "no-store" };
}

export default async function MicroArticlePage({
  params,
}: {
  params: { slug: string } | Promise<{ slug: string }>;
}) {
  const { slug } = await Promise.resolve(params);
  if (!slug || slug === "undefined") {
    notFound();
  }
  let data;
  try {
    data = await fetchMicroArticle(slug, await detailFetchInit());
  } catch (e) {
    console.error("fetchMicroArticle failed", { slug, error: e });
    // Seul un 404 backend signifie « cette fiche n'existe pas » : une panne ou
    // un 500 doit remonter en erreur, pas se déguiser en page inexistante.
    if (isApiError(e) && e.status === 404) {
      notFound();
    }
    throw e;
  }

  return <ReaderClient data={data} />;
}
