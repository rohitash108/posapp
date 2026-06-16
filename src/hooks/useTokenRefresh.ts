/**
 * useTokenRefresh
 *
 * Proactively refreshes the Sanctum token whenever the app returns to the
 * foreground after a long absence (default: 1 hour). This prevents the first
 * API call after a sleep from hitting a 401 and triggering the silent re-auth
 * flow in client.ts.
 *
 * Requires the /auth/refresh endpoint on the Laravel backend:
 *
 *   Route::post('/auth/refresh', function (Request $request) {
 *     $request->user()->currentAccessToken()->delete();
 *     $token = $request->user()->createToken('mobile')->plainTextToken;
 *     return response()->json(['token' => $token]);
 *   })->middleware('auth:sanctum');
 *
 * Usage — add to app/(app)/_layout.tsx:
 *   import { useTokenRefresh } from '@/hooks/useTokenRefresh';
 *   export default function AppLayout() {
 *     useTokenRefresh();
 *     ...
 *   }
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import axios from 'axios';
import { getItem, setItem } from '@/utils/storage';
import { useAppStore } from '@/store/appStore';
import { API_BASE_URL } from '@/api/client';

/** Refresh the token if the app has been in the background for at least this long. */
const REFRESH_AFTER_MS = 60 * 60 * 1000; // 1 hour

async function refreshTokenSilently(): Promise<void> {
  try {
    const token = await getItem('sanctum_token');
    if (!token) return;

    const res = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      {},
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    );

    const newToken: string = res.data.token;
    await setItem('sanctum_token', newToken);
    await setItem('auth_user', JSON.stringify(res.data.user ?? JSON.parse((await getItem('auth_user')) ?? '{}')));

    const { user, restaurant, setAuth } = useAppStore.getState();
    if (user && restaurant) {
      setAuth(user, restaurant, newToken);
    }
  } catch {
    // Silent failure — if the token is genuinely expired, the 401 interceptor
    // in client.ts will catch the next API call and handle re-auth there.
  }
}

export function useTokenRefresh(): void {
  const lastActiveRef = useRef<number>(Date.now());

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Web: use Page Visibility API
      const handleVisibilityChange = async () => {
        if (typeof document === 'undefined') return;
        if (document.visibilityState !== 'visible') return;
        const elapsed = Date.now() - lastActiveRef.current;
        if (elapsed < REFRESH_AFTER_MS) return;
        await refreshTokenSilently();
        lastActiveRef.current = Date.now();
      };

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      return;
    }

    // Native: use AppState
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      const elapsed = Date.now() - lastActiveRef.current;
      if (elapsed < REFRESH_AFTER_MS) return;
      await refreshTokenSilently();
      lastActiveRef.current = Date.now();
    });

    return () => subscription.remove();
  }, []);
}
