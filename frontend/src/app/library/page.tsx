import { Suspense } from "react";
import LibraryClient from "./LibraryClient";

export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryClient />
    </Suspense>
  );
}
