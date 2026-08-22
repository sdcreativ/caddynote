/**
 * Helpers support (§5.16) — SLA indicatif + sérialisation ticket.
 */
import type { StrkSupportTicket, StrkSupportTicketPriority } from '@prisma/client';

/** Délais cibles (heures) avant première prise en charge / résolution ops. */
export const SUPPORT_SLA_HOURS: Record<StrkSupportTicketPriority, number> = {
  urgent: 4,
  high: 8,
  normal: 24,
  low: 72,
};

export type TicketWithSla = StrkSupportTicket & {
  slaDueAt: string;
  slaBreached: boolean;
};

export const withSupportSla = <T extends StrkSupportTicket>(ticket: T): T & { slaDueAt: string; slaBreached: boolean } => {
  const hours = SUPPORT_SLA_HOURS[ticket.priority] ?? 24;
  const due = new Date(ticket.createdAt.getTime() + hours * 60 * 60 * 1000);
  const closed = ticket.status === 'resolved' || ticket.status === 'closed' || !!ticket.closedAt;
  return {
    ...ticket,
    slaDueAt: due.toISOString(),
    slaBreached: !closed && due.getTime() < Date.now(),
  };
};
