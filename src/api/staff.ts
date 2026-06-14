import client from './client';

export const staffApi = {
  list: () => client.get('/staff'),
};
