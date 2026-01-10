import { notFound } from "next/navigation";

import ReaderClient from "./ReaderClient";
import { fetchMicroArticle } from "@/lib/api";

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
    if (process.env.NODE_ENV !== "production") {
      throw e;
    }
    notFound();
  }

  return <ReaderClient data={data} />;
}
