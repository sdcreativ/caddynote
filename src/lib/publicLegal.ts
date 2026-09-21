type LegalContact = {
  companyName: string;
  legalForm: string;
  shareCapital: string;
  registeredAddress: string;
  rccm: string;
  ncc: string;
};

export const LEGAL_FORMS = ['SARL', 'SAS', 'SA', 'SUARL', 'EI', 'autre'] as const;

export const PUBLIC_HOSTING = {
  name: 'Hostinger',
  legalName: 'Hostinger International Ltd.',
  address: '61 Lordou Vironos Street, 6023 Larnaca, Chypre',
} as const;

export type PublicHosting = {
  name: string;
  legalName: string;
  address: string;
};

export const parseHosting = (raw: unknown): PublicHosting => {
  if (!raw || typeof raw !== 'object') return { ...PUBLIC_HOSTING };
  const row = raw as Record<string, unknown>;
  const legalName = typeof row.legalName === 'string' ? row.legalName.trim() : '';
  const address = typeof row.address === 'string' ? row.address.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!legalName || !address) return { ...PUBLIC_HOSTING };
  return {
    name: name || PUBLIC_HOSTING.name,
    legalName,
    address,
  };
};

export const formatPublisherIdentity = (contact: LegalContact): string[] => {
  const lines: string[] = [];
  const title = [contact.companyName, contact.legalForm].filter(Boolean).join(', ');
  if (title) {
    lines.push(contact.shareCapital ? `${title}, capital ${contact.shareCapital}` : title);
  } else if (contact.shareCapital) {
    lines.push(`Capital ${contact.shareCapital}`);
  }
  if (contact.registeredAddress) lines.push(`Siège social : ${contact.registeredAddress}`);
  if (contact.rccm) lines.push(`RCCM : ${contact.rccm}`);
  if (contact.ncc) lines.push(`NCC : ${contact.ncc}`);
  return lines;
};

export const formatHostingLine = (hosting: PublicHosting = PUBLIC_HOSTING): string =>
  `Hébergeur : ${hosting.legalName}, ${hosting.address}`;

export const formatLegalFooterLine = (
  contact: LegalContact,
  hosting: PublicHosting = PUBLIC_HOSTING
): string => [...formatPublisherIdentity(contact), formatHostingLine(hosting)].join(' · ');
