import client from './client';
import type { RoyaltyMeta, RoyaltyPreview, RoyaltyRequest } from '@/types';

export const royaltiesApi = {
  /** GET /royalties — list + summary meta (csPos royalties.index parity) */
  list: () =>
    client.get<{ data: RoyaltyRequest[]; meta: RoyaltyMeta }>('/royalties'),

  /** GET /royalties/preview?period_month=&period_year= */
  preview: (period_month: number, period_year: number) =>
    client.get<RoyaltyPreview>('/royalties/preview', { params: { period_month, period_year } }),

  /** POST /royalties — submit or resubmit (rejected periods) */
  submit: (payload: { period_month: number; period_year: number; notes?: string }) =>
    client.post<{ message: string; data: RoyaltyRequest }>('/royalties', payload),

  /** PUT /royalties/:id — edit notes on pending request */
  updateNotes: (id: number, notes?: string) =>
    client.put<{ message: string; data: RoyaltyRequest }>(`/royalties/${id}`, { notes }),
};
