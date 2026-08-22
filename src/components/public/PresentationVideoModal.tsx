import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const VIDEO_SRC = '/videos/caddynote-presentation.mp4';
const POSTER_SRC = '/videos/caddynote-presentation-poster.jpg';

type PresentationVideoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Lecteur modal — vidéo de présentation produit. */
export function PresentationVideoModal({ open, onOpenChange }: PresentationVideoModalProps) {
  const { t } = useTranslation('home');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (open) {
      el.currentTime = 0;
      void el.play().catch(() => {
        /* autoplay peut être bloqué — contrôles visibles */
      });
    } else {
      el.pause();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden border-0 bg-[#0B1F3A] p-0 text-white sm:rounded-2xl [&>button]:right-4 [&>button]:top-4 [&>button]:rounded-full [&>button]:bg-white/10 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/20 [&>button]:hover:opacity-100">
        <DialogHeader className="space-y-1 px-5 pb-3 pt-5 sm:px-6">
          <DialogTitle className="font-display text-xl font-bold tracking-tight text-white">
            {t('video.title')}
          </DialogTitle>
          <DialogDescription className="text-sm text-white/65">
            {t('video.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-video bg-black">
          <video
            ref={videoRef}
            className="h-full w-full"
            controls
            playsInline
            preload="metadata"
            poster={POSTER_SRC}
            src={VIDEO_SRC}
          >
            <track kind="captions" />
            {t('video.unsupported')}
          </video>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-white/50">{t('video.meta')}</p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/experiences/directions"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              {t('video.seeDirections')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/signup"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#1D70D8] px-4 text-sm font-semibold text-white transition hover:brightness-95"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
              {t('video.trial')}
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
