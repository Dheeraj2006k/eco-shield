'use client';

import { ErrorState } from '@/components/common/states';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="px-4">
      <ErrorState title="Something went wrong" detail={error.message || 'An unexpected error occurred while rendering this page.'} onRetry={reset} />
    </div>
  );
}
