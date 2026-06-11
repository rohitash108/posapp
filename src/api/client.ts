import axios from 'axios';
import { getItem, deleteItem } from '@/utils/storage';

export const API_BASE_URL = 'https://restaurant.softwar.in/api/mobile';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

client.interceptors.request.use(async (config) => {
  const token = await getItem('sanctum_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await deleteItem('sanctum_token');
      await deleteItem('auth_user');
    }
    return Promise.reject(error);
  }
);

export default client;
