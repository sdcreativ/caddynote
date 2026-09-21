import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { PUBLIC_HOSTING, parseHosting, type PublicHosting } from '@/lib/publicLegal';

export const DEFAULT_PUBLIC_EMAIL = 'contact@caddynote.sdcreativ.com';
export { PUBLIC_HOSTING, type PublicHosting };

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
  companyName: string;
  legalForm: string;
  shareCapital: string;
  registeredAddress: string;
  rccm: string;
  ncc: string;
};

export const EMPTY_PUBLIC_CONTACT: PublicContact = {
  email: DEFAULT_PUBLIC_EMAIL,
  phone: '',
  whatsapp: '',
  companyName: '',
  legalForm: '',
  shareCapital: '',
  registeredAddress: '',
  rccm: '',
  ncc: '',
};

const readContactField = (raw: PublicContact | undefined, key: keyof PublicContact, fallback = ''): string =>
  typeof raw?.[key] === 'string' ? raw[key] : fallback;

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
  hosting: PublicHosting;
  stats: PublicStats;
  faq: PublicFaqItem[];
};

export const EMPTY_VITRINE: PublicVitrine = {
  testimonials: [],
  contact: { ...EMPTY_PUBLIC_CONTACT },
  hosting: { ...PUBLIC_HOSTING },
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

  const fetchVitrine = async (): Promise<PublicVitrine> => {
    try {
      if (typeof apiClient.get !== 'function') return EMPTY_VITRINE;
      const data = await apiClient.get<PublicVitrine>('/public/vitrine', { skipAuth: true });
      cache = {
        testimonials: Array.isArray(data.testimonials) ? data.testimonials : [],
        contact: {
          email: readContactField(data.contact, 'email', DEFAULT_PUBLIC_EMAIL),
          phone: readContactField(data.contact, 'phone'),
          whatsapp: readContactField(data.contact, 'whatsapp'),
          companyName: readContactField(data.contact, 'companyName'),
          legalForm: readContactField(data.contact, 'legalForm'),
          shareCapital: readContactField(data.contact, 'shareCapital'),
          registeredAddress: readContactField(data.contact, 'registeredAddress'),
          rccm: readContactField(data.contact, 'rccm'),
          ncc: readContactField(data.contact, 'ncc'),
        },
        hosting: parseHosting(data.hosting),
        stats: {
          schools: typeof data.stats?.schools === 'number' ? data.stats.schools : null,
          students: typeof data.stats?.students === 'number' ? data.stats.students : null,
        },
        faq: Array.isArray(data.faq) ? data.faq : [],
      };
      return cache;
    } catch {
      return EMPTY_VITRINE;
    } finally {
      inflight = null;
    }
  };

  inflight = fetchVitrine();
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
    void loadPublicVitrine()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (!cancelled) setData(EMPTY_VITRINE);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
};
