"use client";

import { FeedClient } from "@/components/FeedClient";
import { FilterSheet } from "@/components/FilterSheet";
import { MobileScaffold } from "@/components/MobileScaffold";

export default function LibraryClient() {
  return (
    <MobileScaffold
      title="Bibliothèque"
      headerRight={<FilterSheet basePath="/library" />}
      contentClassName="space-y-4"
    >
      <FeedClient basePath="/library" embedded />
    </MobileScaffold>
  );
}
