import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { fadeUp, reducedMotionTransition, stagger } from '@/components/public/motion';
import { cn } from '@/lib/utils';

type FadeInProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export function FadeIn({ children, className, delay = 0 }: FadeInProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      // margin bas : déclenche l’anim dès que le bloc approche du viewport
      viewport={{ once: true, amount: 0.08, margin: '0px 0px -8% 0px' }}
      transition={reduce ? reducedMotionTransition : { delay, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={cn(className)}
      variants={stagger}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.06, margin: '0px 0px -8% 0px' }}
      transition={reduce ? reducedMotionTransition : undefined}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}
