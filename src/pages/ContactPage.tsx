import { ContactFormContent } from '@/components/contact/ContactFormContent';
import { PublicShell } from '@/components/public/PublicShell';

export default function ContactPage() {
  return (
    <PublicShell>
      <main className="flex-1">
        <ContactFormContent />
      </main>
    </PublicShell>
  );
}
