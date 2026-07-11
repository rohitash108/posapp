/**
 * App-wide order polling — keeps badges fresh and detects new Zomato/Swiggy/QR
 * orders even when the Orders screen is not mounted (native tab switch / background).
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { ordersApi, normalizeOrder } from '@/api/orders';
import { useOrderBadgeStore } from '@/store/orderBadgeStore';
import { useAppStore } from '@/store/appStore';
import type { Order } from '@/types';

export const ORDER_POLL_MS = 15_000;

function isAgg(o: Order) {
  return o.source === 'zomato' || o.source === 'swiggy';
}

function playNewOrderBeep() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    play(880, 0, 0.18);
    play(660, 0.22, 0.25);
  } catch { /* ignore */ }
}

function notifyAggOrders(source: string, orders: Order[]) {
  const label = source === 'zomato' ? 'Zomato' : 'Swiggy';
  const nums = orders.map(o => o.order_number ?? `#${o.id}`).join(' · ');
  playNewOrderBeep();
  useOrderBadgeStore.getState().setAggAlert({ source, orders });
  Toast.show({
    type: 'info',
    text1: orders.length === 1 ? `New ${label} Order!` : `${orders.length} New ${label} Orders!`,
    text2: nums,
    visibilityTime: 8000,
    position: 'top',
  });
}

function notifyQROrders(orders: Order[]) {
  playNewOrderBeep();
  useOrderBadgeStore.getState().setQrAlert(orders);
  Toast.show({
    type: 'info',
    text1: orders.length === 1 ? 'New QR Order!' : `${orders.length} New QR Orders!`,
    text2: orders.map(o => o.order_number ?? `#${o.id}`).join(' · '),
    visibilityTime: 8000,
    position: 'top',
  });
}

export function useGlobalOrderPolling() {
  const token = useAppStore((s) => s.token);
  const knownIds = useRef<Set<number>>(new Set());
  const isFirstLoad = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function poll(silent = true) {
      if (cancelled) return;
      if (appState.current !== 'active') return;

      try {
        const res = await ordersApi.list({ per_page: 300 });
        if (cancelled) return;

        const raw: Order[] = Array.isArray(res.data?.data ?? res.data) ? (res.data?.data ?? res.data) : [];
        const data = raw.map(normalizeOrder);

        const pendingCount = data.filter(o => o.status === 'pending').length;
        const kitchenCount = data.filter(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)).length;
        useOrderBadgeStore.getState().update(pendingCount, kitchenCount);
        useOrderBadgeStore.getState().bumpRefresh();

        if (isFirstLoad.current) {
          data.forEach(o => knownIds.current.add(o.id));
          isFirstLoad.current = false;
          return;
        }

        const newAgg = data.filter(o => isAgg(o) && !knownIds.current.has(o.id));
        if (newAgg.length > 0) {
          const src = newAgg.filter(o => o.source === 'zomato').length >= newAgg.filter(o => o.source === 'swiggy').length
            ? 'zomato' : 'swiggy';
          notifyAggOrders(src, newAgg);
        }

        const newQR = data.filter(o => o.source === 'qr' && !knownIds.current.has(o.id));
        if (newQR.length > 0) {
          if (newAgg.length > 0) {
            setTimeout(() => { if (!cancelled) notifyQROrders(newQR); }, 9000);
          } else {
            notifyQROrders(newQR);
          }
        }

        data.forEach(o => knownIds.current.add(o.id));
      } catch (e) {
        if (!silent) console.warn('[orderPoll]', e);
      }
    }

    function startPolling() {
      if (pollRef.current) return;
      pollRef.current = setInterval(() => poll(true), ORDER_POLL_MS);
    }

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    poll(false);
    startPolling();

    const sub = AppState.addEventListener('change', (next) => {
      appState.current = next;
      if (next === 'active') {
        poll(true);
        startPolling();
      } else {
        stopPolling();
      }
    });

    let removeVisibility: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          appState.current = 'active';
          poll(true);
          startPolling();
        } else {
          appState.current = 'background';
          stopPolling();
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      removeVisibility = () => document.removeEventListener('visibilitychange', onVisible);
    }

    return () => {
      cancelled = true;
      stopPolling();
      sub.remove();
      removeVisibility?.();
      isFirstLoad.current = true;
      knownIds.current.clear();
    };
  }, [token]);
}
