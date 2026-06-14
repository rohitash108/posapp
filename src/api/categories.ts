import client from './client';

export const categoriesApi = {
  list: () => client.get('/categories'),
};
