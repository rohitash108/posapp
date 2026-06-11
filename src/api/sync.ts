import client from './client';

export const syncApi = {
  pull: (since?: string) =>
    client.get('/sync/pull', { params: since ? { since } : undefined }),
  push: (payload: { orders?: any[]; status_updates?: any[] }) =>
    client.post('/sync/push', payload),
};
