import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { MicroArticleListItem } from "@/lib/types";

export function MicroCard({ item }: { item: MicroArticleListItem }) {
  return (
    <Link
      href={`/micro/${item.slug}`}
      className="block rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent"
    >
      <div className="flex gap-4 p-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
          {item.cover_image_url ? (
            <Image
              src={item.cover_image_url}
              alt={item.title_question}
              fill
              className="object-cover"
              sizes="80px"
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-base font-semibold leading-snug">
            {item.title_question}
          </div>
          <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {item.answer_express}
          </div>

          {item.key_points?.length ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {item.key_points.slice(0, 3).map((p) => (
                <Badge key={p} variant="secondary" className="max-w-full truncate">
                  {p}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
