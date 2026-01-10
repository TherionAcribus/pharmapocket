import { Suspense } from "react";

import DiscoverClient from "./DiscoverClient";

export default function DiscoverPage() {
  return (
    <Suspense>
      <DiscoverClient />
    </Suspense>
  );
}
