import { Suspense } from "react";

import { FeedClient } from "@/components/FeedClient";

export default function Home() {
  return (
    <Suspense>
      <FeedClient />
    </Suspense>
  );
}
