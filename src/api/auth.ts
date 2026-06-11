import client from './client';

export const authApi = {
  login: (payload: { email: string; password: string }) =>
    client.post('/auth/login', payload),
  logout: () => client.post('/auth/logout'),
  me: () => client.get('/auth/me'),
};
