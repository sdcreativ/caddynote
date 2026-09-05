import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';

export const DEFAULT_PUBLIC_EMAIL = 'contact@caddynote.com';

export type PublicTestimonial = {
  quote: string;
  name: string;
  role: string;
  place: string;
};

export type PublicContact = {
  email: string;
  phone: string;
  whatsapp: string;
};

export type PublicStats = {
  schools: number | null;
  students: number | null;
};

export type PublicFaqItem = {
  q: string;
  a: string;
};

export type PublicVitrine = {
  testimonials: PublicTestimonial[];
  contact: PublicContact;
  stats: PublicStats;
  faq: PublicFaqItem[];
};

export const EMPTY_VITRINE: PublicVitrine = {
  testimonials: [],
  contact: { email: DEFAULT_PUBLIC_EMAIL, phone: '', whatsapp: '' },
  stats: { schools: null, students: null },
  faq: [],
};

let cache: PublicVitrine | null = null;
let inflight: Promise<PublicVitrine> | null = null;

export const clearPublicVitrineCache = () => {
  cache = null;
  inflight = null;
};

export const loadPublicVitrine = async (): Promise<PublicVitrine> => {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = apiClient
    .get<PublicVitrine>('/public/vitrine', { skipAuth: true })
    .then((data) => {
      cache = {
        testimonials: Array.isArray(data.testimonials) ? data.testimonials : [],
        contact: {
          email: typeof data.contact?.email === 'string' ? data.contact.email : DEFAULT_PUBLIC_EMAIL,
          phone: typeof data.contact?.phone === 'string' ? data.contact.phone : '',
          whatsapp: typeof data.contact?.whatsapp === 'string' ? data.contact.whatsapp : '',
        },
        stats: {
          schools: typeof data.stats?.schools === 'number' ? data.stats.schools : null,
          students: typeof data.stats?.students === 'number' ? data.stats.students : null,
        },
        faq: Array.isArray(data.faq) ? data.faq : [],
      };
      return cache;
    })
    .catch(() => EMPTY_VITRINE)
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

export const phoneDigits = (value: string): string => value.replace(/\D/g, '');

export const telHref = (phone: string): string | null => {
  const digits = phoneDigits(phone);
  if (digits.length < 8) return null;
  return `tel:+${digits}`;
};

export const waHref = (whatsapp: string): string | null => {
  const digits = phoneDigits(whatsapp);
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
};

export const usePublicVitrine = (): PublicVitrine => {
  const [data, setData] = useState<PublicVitrine>(cache ?? EMPTY_VITRINE);

  useEffect(() => {
    let cancelled = false;
    void loadPublicVitrine().then((next) => {
      if (!cancelled) setData(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
};
