import Image from "next/image";
import Link from "next/link";

import { FilterSheet } from "@/components/FilterSheet";
import { SeeMoreRenderer } from "@/components/SeeMoreRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { fetchMicroArticle } from "@/lib/api";

export default async function MicroArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = params;
  const data = await fetchMicroArticle(slug);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/">Retour</Link>
          </Button>
          <div className="flex-1" />
          <FilterSheet />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <div className="space-y-3">
          <div className="text-2xl font-semibold leading-snug">{data.title_question}</div>
          <div className="text-base text-muted-foreground">{data.answer_express}</div>

          {data.cover_image_url ? (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border bg-muted">
              <Image
                src={data.cover_image_url}
                alt={data.title_question}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 768px"
                priority
              />
            </div>
          ) : null}

          {data.key_points?.length ? (
            <div className="flex flex-wrap gap-1">
              {data.key_points.map((p) => (
                <Badge key={p} variant="secondary" className="max-w-full truncate">
                  {p}
                </Badge>
              ))}
            </div>
          ) : null}

          {data.tags_payload?.length ? (
            <div className="flex flex-wrap gap-1">
              {data.tags_payload.map((t) => (
                <Badge key={t.id} variant="outline" className="truncate">
                  {t.name}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="text-lg font-semibold">Voir plus</div>
          <SeeMoreRenderer seeMore={data.see_more} links={data.links} />
        </div>

        {data.questions?.length ? (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="text-lg font-semibold">Questions</div>
              <div className="space-y-3">
                {data.questions.map((q) => (
                  <div key={q.id} className="rounded-xl border p-4">
                    <div className="text-sm font-semibold">{q.prompt}</div>
                    {q.explanation ? (
                      <div className="mt-2 text-sm text-muted-foreground">{q.explanation}</div>
                    ) : null}
                    {q.choices ? (
                      <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                        {JSON.stringify(q.choices, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
