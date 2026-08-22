import React, { useState } from 'react';
import { PublicShell } from '@/components/public/PublicShell';
import { Button } from '@/components/ui/button';
import { MenuIcon, BookOpen } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface GuideLayoutProps {
  children: React.ReactNode;
  tocComponent: React.ReactElement<{ onClose?: () => void }>;
}

export default function GuideLayout({ children, tocComponent }: GuideLayoutProps) {
  const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);

  const renderTocWithClose = (onCloseHandler: () => void) => {
    return React.cloneElement(tocComponent, { onClose: onCloseHandler });
  };

  return (
    <PublicShell>
      <main className="flex flex-1">
        <aside className="fixed bottom-0 left-0 top-16 hidden w-72 overflow-y-auto border-r border-slate-200 bg-white p-6 lg:block">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
            <BookOpen className="h-5 w-5 text-[#05335C]" aria-hidden="true" />
            Table des matières
          </h2>
          {tocComponent}
        </aside>

        <div className="flex-1 lg:ml-72">
          <div className="sticky top-16 z-10 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <Button
              variant="outline"
              onClick={() => setIsMobileTocOpen(true)}
              className="w-full justify-center rounded-md"
            >
              <MenuIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              Table des matières
            </Button>
          </div>

          <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
            <article className="py-2 sm:py-4">
              {children}
            </article>
          </div>
        </div>
      </main>

      <Sheet open={isMobileTocOpen} onOpenChange={setIsMobileTocOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
              Table des matières
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6">{renderTocWithClose(() => setIsMobileTocOpen(false))}</div>
        </SheetContent>
      </Sheet>
    </PublicShell>
  );
}
