import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

/** Smartphone photoréaliste — suivi parent (maquette terrain). */
export function OfflinePhonePreview() {
  const reduce = useReducedMotion();
  const { t } = useTranslation('home');

  return (
    <div className="relative mx-auto flex w-full max-w-[300px] justify-center sm:max-w-[340px]">
      <motion.div
        className="relative z-10 w-full"
        initial={reduce ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.img
          src="/caddynote-phone-mockup.png?v=3"
          alt={t('phoneAlt')}
          width={720}
          height={1280}
          className="h-auto w-full select-none"
          draggable={false}
          animate={reduce ? undefined : { y: [0, -8, 0] }}
          transition={
            reduce ? undefined : { duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }
          }
        />
      </motion.div>
    </div>
  );
}
