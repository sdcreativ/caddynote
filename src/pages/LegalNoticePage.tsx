import { LegalDocument } from '@/components/legal/LegalDocument';
import { PublicShell } from '@/components/public/PublicShell';

export default function LegalNoticePage() {
  return (
    <PublicShell>
      <main className="flex-1 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <LegalDocument kind="notice" />
        </div>
      </main>
    </PublicShell>
  );
}
