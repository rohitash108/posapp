import axios from 'axios';
import { Platform } from 'react-native';
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

let redirectingToLogin = false;

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const reqUrl = error.config?.url ?? '';
      const isAuthRoute = reqUrl.includes('/auth/login') || reqUrl.includes('/auth/logout');
      if (isAuthRoute) return Promise.reject(error);

      await deleteItem('sanctum_token');
      await deleteItem('auth_user');
      await deleteItem('auth_restaurant');
      if (!redirectingToLogin) {
        redirectingToLogin = true;
        try {
          const { router } = await import('expo-router');
          const { useAppStore } = await import('@/store/appStore');
          useAppStore.getState().clearAuth();
          router.replace('/(auth)/login');
        } catch {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.location.href = '/';
          }
        } finally {
          setTimeout(() => { redirectingToLogin = false; }, 2000);
        }
      }
    }
    return Promise.reject(error);
  }
);

export default client;
