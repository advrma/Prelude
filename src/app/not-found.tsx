import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        title="Nothing out here but stars"
        action={
          <Link href="/" className="btn btn-primary">
            Back to Prelude
          </Link>
        }
      >
        That page doesn&apos;t exist. If you followed a link to a pre-date or match, the demo may have been reset.
      </EmptyState>
    </div>
  );
}
