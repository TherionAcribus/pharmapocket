import { notFound } from "next/navigation";

import ReaderClient from "./ReaderClient";
import { isApiError } from "@/lib/api/client";
import { fetchMicroArticle } from "@/lib/api/content";

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
    data = await fetchMicroArticle(slug);
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
