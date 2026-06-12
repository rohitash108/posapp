import client from './client';

export const staffApi = {
  list: () => client.get('/staff'),
  show: (id: number) => client.get(`/staff/${id}`),
};
