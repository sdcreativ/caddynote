import { AboutContent } from '@/components/about/AboutContent';
import { PublicShell } from '@/components/public/PublicShell';

export default function AboutPage() {
  return (
    <PublicShell>
      <main className="flex-1">
        <AboutContent />
      </main>
    </PublicShell>
  );
}
