import { HelpContent } from '@/components/help/HelpContent';
import { PublicShell } from '@/components/public/PublicShell';

export default function HelpPage() {
  return (
    <PublicShell>
      <main className="flex-1 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <HelpContent />
        </div>
      </main>
    </PublicShell>
  );
}
