import { Suspense } from "react";

import OAuthCallbackClient from "./OAuthCallbackClient";

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <OAuthCallbackClient />
    </Suspense>
  );
}
