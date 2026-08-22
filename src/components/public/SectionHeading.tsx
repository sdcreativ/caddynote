import { FadeIn } from '@/components/public/FadeIn';
import { cn } from '@/lib/utils';

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
}: SectionHeadingProps) {
  return (
    <FadeIn className={cn(align === 'center' ? 'mx-auto text-center' : 'text-left', 'max-w-2xl', className)}>
      {eyebrow ? (
        <p className="mb-2 text-sm font-medium text-[#05335C]">{eyebrow}</p>
      ) : null}
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-slate-500 sm:text-lg">{description}</p>
      ) : null}
    </FadeIn>
  );
}
