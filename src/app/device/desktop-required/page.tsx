import { Suspense } from "react";
import { DesktopRequiredClient } from "./DesktopRequiredClient";

export default function DesktopRequiredPage() {
  return (
    <Suspense>
      <DesktopRequiredClient />
    </Suspense>
  );
}
