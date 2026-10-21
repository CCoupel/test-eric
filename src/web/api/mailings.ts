import { api } from './client';

export type MailingStatus = 'sending' | 'sent' | 'partial' | 'failed';

export interface Mailing {
  id: string;
  subject: string;
  body?: string;
  status: MailingStatus;
  transport: 'smtp' | 'stub';
  sender: { id: string; name: string };
  activities: { id: string; title: string }[];
  recipients_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface MailingRecipient {
  email: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
}

export interface RecipientsPreview {
  recipients_count: number;
  by_activity: { id: string; title: string; count: number }[];
}

export const mailingsApi = {
  list: () => api<{ mailings: Mailing[] }>('GET', '/api/mailings').then((r) => r.mailings),
  get: (id: string) => api<{ mailing: Mailing; recipients: MailingRecipient[] }>('GET', `/api/mailings/${id}`),
  preview: (activityIds: string[]) =>
    api<RecipientsPreview>('GET', `/api/mailings/recipients-preview?activity_ids=${activityIds.map(encodeURIComponent).join(',')}`),
  create: (input: { activity_ids: string[]; subject: string; body: string }) =>
    api<{ mailing: Mailing }>('POST', '/api/mailings', input).then((r) => r.mailing),
  mailStatus: () => api<{ transport: 'smtp' | 'stub'; from: string | null }>('GET', '/api/mail/status'),
};

export const unsubscribeApi = {
  info: (token: string) =>
    api<{ activities: { title: string; starts_at: string }[] }>('GET', `/api/public/unsubscribe/${encodeURIComponent(token)}`),
  confirm: (token: string) => api('POST', `/api/public/unsubscribe/${encodeURIComponent(token)}`),
};
