import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import ReaderClient from "./ReaderClient";
import { isApiError } from "@/lib/api/client";
import { fetchMicroArticle } from "@/lib/api/content";

/**
 * Relaie la session Django au fetch serveur.
 *
 * Sans ça, l'API voit une requête anonyme et omet `is_saved` / `is_read` : le
 * lecteur devrait alors les redemander carte par carte côté client. On ne
 * transmet que le cookie de session — le reste des cookies du front n'a rien à
 * faire dans un appel API.
 */
async function sessionHeaders(): Promise<RequestInit | undefined> {
  const session = (await cookies()).get("sessionid");
  if (!session) return undefined;
  return { headers: { cookie: `sessionid=${session.value}` } };
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
    data = await fetchMicroArticle(slug, await sessionHeaders());
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
