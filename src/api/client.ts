import axios from 'axios';
import { Platform } from 'react-native';
import { getItem, setItem, deleteItem } from '@/utils/storage';

export const API_BASE_URL = 'https://restaurant.softwar.in/api/mobile';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

// ── Request interceptor: attach Bearer token ──────────────────────────────────
client.interceptors.request.use(async (config) => {
  const token = await getItem('sanctum_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Refresh state ─────────────────────────────────────────────────────────────
// Prevents multiple concurrent 401s from each triggering a separate re-auth.
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

function releasePending(token: string | null) {
  pendingQueue.forEach((fn) => fn(token));
  pendingQueue = [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function isDeviceOnline(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
  try {
    const { useAppStore } = await import('@/store/appStore');
    return useAppStore.getState().isOnline;
  } catch {
    return true;
  }
}

/**
 * Attempts a silent re-login using saved "remember me" credentials.
 * Returns the new token on success, or null if credentials are unavailable
 * or the login itself fails.
 */
async function silentReauth(): Promise<string | null> {
  try {
    const saved = await getItem('remember_me_credentials');
    if (!saved) return null;

    const { email, password } = JSON.parse(saved);

    // Use a raw axios call — NOT the `client` instance — to avoid re-triggering
    // this interceptor and causing an infinite loop.
    const res = await axios.post(
      `${API_BASE_URL}/auth/login`,
      { email, password },
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
    );

    const { token, user, restaurant } = res.data;
    await setItem('sanctum_token', token);
    await setItem('auth_user', JSON.stringify(user));
    await setItem('auth_restaurant', JSON.stringify(restaurant));

    const { useAppStore } = await import('@/store/appStore');
    useAppStore.getState().setAuth(user, restaurant, token);

    return token;
  } catch {
    return null;
  }
}

/**
 * Full logout: clears local storage and redirects to login.
 * Only called when silent re-auth also fails, confirming the session
 * is genuinely invalid (not just a transient network error).
 */
async function performLogout() {
  await deleteItem('sanctum_token');
  await deleteItem('auth_user');
  await deleteItem('auth_restaurant');
  try {
    const { useAppStore } = await import('@/store/appStore');
    const { router } = await import('expo-router');
    useAppStore.getState().clearAuth();
    router.replace('/(auth)/login');
  } catch {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }
}

// ── Response interceptor: resilient 401 handling ──────────────────────────────
//
// Decision tree on 401:
//   1. Auth routes (login/logout) → pass through unchanged
//   2. Device offline            → reject but keep session intact
//   3. Already refreshing        → queue request, wait for result
//   4. Attempt silent re-auth    → if success, retry original request
//   5. Re-auth failed            → genuine expiry → performLogout()
//
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401 Unauthorized
    if (error.response?.status !== 401) return Promise.reject(error);

    // Never intercept auth routes themselves
    const url = originalRequest?.url ?? '';
    if (url.includes('/auth/login') || url.includes('/auth/logout')) {
      return Promise.reject(error);
    }

    // If the device is offline, the 401 may be a network artefact.
    // Keep the session intact and let the caller handle the error.
    if (!(await isDeviceOnline())) return Promise.reject(error);

    // If a refresh is already in progress, queue this request until done.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push((newToken) => {
          if (!newToken) return reject(error);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(client(originalRequest));
        });
      });
    }

    // Attempt silent re-authentication with saved credentials.
    isRefreshing = true;
    const newToken = await silentReauth();
    isRefreshing = false;

    if (newToken) {
      // Re-auth succeeded — retry the original request and release the queue.
      releasePending(newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return client(originalRequest);
    }

    // Re-auth failed — session is genuinely invalid. Log out.
    releasePending(null);
    await performLogout();
    return Promise.reject(error);
  },
);

export default client;
