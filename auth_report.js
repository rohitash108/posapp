const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, Header, Footer, PageNumber, TableOfContents,
} = require('/sessions/jolly-keen-gauss/home/lib/node_modules/docx');
const fs = require('fs');

// ─── Helpers ────────────────────────────────────────────────────────────────

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, bold: true, size: 32, font: 'Arial', color: '1A2B1A' })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 80 },
    children: [new TextRun({ text, bold: true, size: 26, font: 'Arial', color: '2E4D2E' })],
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 22, font: 'Arial', ...opts })],
  });
}

function pRuns(runs) {
  return new Paragraph({
    spacing: { after: 120 },
    children: runs.map(r => new TextRun({ size: 22, font: 'Arial', ...r })),
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: 'Arial' })],
  });
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'numbers', level },
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: 'Arial' })],
  });
}

function code(text) {
  return new Paragraph({
    spacing: { after: 40 },
    shading: { fill: 'F1F5F0', type: ShadingType.CLEAR },
    indent: { left: 360, right: 360 },
    children: [new TextRun({ text, size: 18, font: 'Courier New', color: '1A2B1A' })],
  });
}

function spacer(n = 1) {
  return Array.from({ length: n }, () => new Paragraph({ spacing: { after: 60 }, children: [new TextRun('')] }));
}

const innerBorder = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
const borders = { top: innerBorder, bottom: innerBorder, left: innerBorder, right: innerBorder };
const headerBorderStyle = { style: BorderStyle.SINGLE, size: 4, color: 'C9A52A' };
const headerBorders = { top: headerBorderStyle, bottom: headerBorderStyle, left: headerBorderStyle, right: headerBorderStyle };

function tableRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    children: cells.map(({ text, width, shade }) =>
      new TableCell({
        borders: isHeader ? headerBorders : borders,
        width: { size: width, type: WidthType.DXA },
        shading: { fill: shade || (isHeader ? '1A2B1A' : 'FFFFFF'), type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({
            text,
            size: 20,
            font: 'Arial',
            bold: isHeader,
            color: isHeader ? 'FFFFFF' : '374151',
          })],
        })],
      })
    ),
  });
}

function severityRow(num, sev, file, line, description, sevColor) {
  const cols = [
    { text: num,         width: 520,  shade: 'F9FAFB' },
    { text: sev,         width: 1000, shade: sevColor  },
    { text: file,        width: 2200, shade: 'F9FAFB' },
    { text: line,        width: 900,  shade: 'F9FAFB' },
    { text: description, width: 4740, shade: 'FFFFFF'  },
  ];
  return new TableRow({
    children: cols.map(({ text, width, shade }) =>
      new TableCell({
        borders,
        width: { size: width, type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text, size: 18, font: 'Arial', color: '111827' })],
        })],
      })
    ),
  });
}

// ─── Document ───────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        ],
      },
      {
        reference: 'numbers',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ],
      },
    ],
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial', color: '1A2B1A' },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: '2E4D2E' },
        paragraph: { spacing: { before: 280, after: 80 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Arial', color: 'C9A52A' },
        paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 } },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9A52A', space: 1 } },
              tabStops: [{ type: 'right', position: 9360 }],
              children: [
                new TextRun({ text: 'Global Tea Cafe · CSPos Mobile', size: 18, font: 'Arial', color: '6B7280' }),
                new TextRun({ text: '\t', size: 18, font: 'Arial' }),
                new TextRun({ text: 'Authentication Architecture Report', size: 18, font: 'Arial', color: '6B7280' }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 6, color: 'C9A52A', space: 1 } },
              tabStops: [{ type: 'right', position: 9360 }],
              children: [
                new TextRun({ text: 'Confidential · June 2026', size: 18, font: 'Arial', color: '9CA3AF' }),
                new TextRun({ text: '\t', size: 18 }),
                new TextRun({ text: 'Page ', size: 18, font: 'Arial', color: '9CA3AF' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Arial', color: '9CA3AF' }),
              ],
            }),
          ],
        }),
      },
      children: [

        // ── Cover ──────────────────────────────────────────────────────────
        new Paragraph({
          spacing: { before: 480, after: 0 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: 'C9A52A', space: 4 } },
          children: [new TextRun({ text: 'SESSION PERSISTENCE &', size: 52, bold: true, font: 'Arial', color: '1A2B1A' })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 120 },
          children: [new TextRun({ text: 'AUTHENTICATION ARCHITECTURE REPORT', size: 52, bold: true, font: 'Arial', color: '1A2B1A' })],
        }),
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: 'CSPos Mobile · Global Tea Cafe Billing System', size: 26, font: 'Arial', color: '4B5563' })],
        }),
        new Paragraph({
          spacing: { after: 360 },
          children: [new TextRun({ text: 'Prepared by: Senior Mobile Architect  ·  June 16, 2026', size: 20, font: 'Arial', color: '9CA3AF' })],
        }),

        // ── Executive Summary ──────────────────────────────────────────────
        h1('Executive Summary'),
        p('A full audit of the CSPos mobile application codebase has identified five root causes that result in users being logged out automatically. The primary cause is an overly aggressive 401 response interceptor in the API client layer (src/api/client.ts) that immediately clears all authentication state on any unauthorized response — including responses from background polling tasks and temporary server errors — without any retry mechanism or offline awareness.'),
        p('This report details each root cause with the exact file and line reference, explains the impact, and provides ready-to-implement code fixes. All recommendations follow the “infinite session” model used by WhatsApp, Gmail, and Uber: users remain authenticated until they explicitly choose to log out.'),
        ...spacer(1),

        // ── TOC ────────────────────────────────────────────────────────────
        h1('Table of Contents'),
        new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
        ...spacer(1),

        // ═══════════════════════════════════════════════════════════════════
        h1('1. System Overview'),
        p('The application is a React Native / Expo project targeting iOS, Android, and web (PWA + Electron). Authentication uses Laravel Sanctum API tokens stored in platform-specific secure storage. The token is attached to every API request via an Axios request interceptor.'),
        ...spacer(1),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3000, 6360],
          rows: [
            tableRow([{ text: 'File', width: 3000 }, { text: 'Role', width: 6360 }], true),
            tableRow([{ text: 'src/api/client.ts', width: 3000 }, { text: 'Axios instance — request/response interceptors', width: 6360 }]),
            tableRow([{ text: 'src/api/auth.ts', width: 3000 }, { text: 'Auth API calls: login, logout, me', width: 6360 }]),
            tableRow([{ text: 'src/store/appStore.ts', width: 3000 }, { text: 'Zustand store: holds token, user, restaurant; persisted via SecureStore / localStorage', width: 6360 }]),
            tableRow([{ text: 'src/utils/storage.ts', width: 3000 }, { text: 'Cross-platform storage wrapper (SecureStore on native, localStorage on web)', width: 6360 }]),
            tableRow([{ text: 'app/_layout.tsx', width: 3000 }, { text: 'Root layout: bootstraps auth on every app open, validates session with server', width: 6360 }]),
            tableRow([{ text: 'app/(app)/_layout.tsx', width: 3000 }, { text: 'Protected layout: polls ticket notifications every 20 s, handles logout button', width: 6360 }]),
            tableRow([{ text: 'app/(auth)/login.tsx', width: 3000 }, { text: 'Login screen: stores credentials for "remember me" feature', width: 6360 }]),
            tableRow([{ text: 'src/sync/SyncService.ts', width: 3000 }, { text: 'Native background sync (SQLite via NetInfo)', width: 6360 }]),
            tableRow([{ text: 'src/sync/WebSyncService.ts', width: 3000 }, { text: 'Web background sync (IndexedDB)', width: 6360 }]),
          ],
        }),
        ...spacer(1),

        // ═══════════════════════════════════════════════════════════════════
        h1('2. Root Cause Analysis'),
        p('Five distinct defects work in combination to produce the auto-logout behaviour. They are listed in order of severity.'),
        ...spacer(1),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [520, 1000, 2200, 900, 4740],
          rows: [
            tableRow([
              { text: '#', width: 520 }, { text: 'Severity', width: 1000 },
              { text: 'File', width: 2200 }, { text: 'Line(s)', width: 900 },
              { text: 'Description', width: 4740 },
            ], true),
            severityRow('RC-1', 'CRITICAL', 'src/api/client.ts', '21–50', 'Aggressive 401 interceptor: any 401 from any endpoint immediately clears auth and redirects to login — no retry, no offline check', 'FEE2E2'),
            severityRow('RC-2', 'CRITICAL', 'app/_layout.tsx', '45–68', 'Bootstrap session validation: authApi.me() is called on every app open; a 401 response deletes all tokens before the user sees a screen', 'FEE2E2'),
            severityRow('RC-3', 'HIGH', 'Laravel backend', 'sanctum.php', 'SANCTUM_EXPIRATION is likely set to a short value; tokens expire server-side and trigger RC-1', 'FEF3C7'),
            severityRow('RC-4', 'HIGH', 'src/api/client.ts', '19–50', 'No retry or refresh mechanism: a single 401 is terminal — there is no silent re-auth attempt before logout', 'FEF3C7'),
            severityRow('RC-5', 'MEDIUM', 'src/store/appStore.ts', '9–13', 'Dual-storage inconsistency: token lives in both individual SecureStore keys AND the Zustand persist store; partial clearing causes unpredictable state on restart', 'E0F2FE'),
          ],
        }),
        ...spacer(1),

        h2('RC-1 · Aggressive 401 Interceptor'),
        p('File: src/api/client.ts  ·  Lines 21–50'),
        p('The Axios response interceptor catches every 401 Unauthorized response from every endpoint and immediately performs a full logout — deleting tokens from storage, calling clearAuth(), and navigating to the login screen. There is no retry logic, no offline check, and no distinction between a genuinely revoked token and a transient server error.'),
        p('Three background processes make this especially damaging:'),
        bullet('Ticket notification polling runs every 20 seconds (app/(app)/_layout.tsx line 320). A single 401 from any one of those polls — caused by a server restart or brief network hiccup — logs the user out immediately.'),
        bullet('WebSyncService and SyncService make multiple API calls every time they run. A 401 on any single call cascades into full logout.'),
        bullet('On server restarts, Laravel Sanctum may temporarily return 401s for valid tokens while the server initialises. Any user with the app open at that moment is logged out.'),
        bullet('The redirectingToLogin flag resets after only 2 seconds (line 44). If multiple concurrent requests all get 401s, the logout path can be entered multiple times within that window.'),
        ...spacer(1),

        h2('RC-2 · Blocking Bootstrap Session Validation'),
        p('File: app/_layout.tsx  ·  Lines 45–68'),
        p('Every time the app is opened, bootstrap() calls authApi.me() synchronously to validate the stored token. The UI does not hydrate (setHydrated() at line 71) until this completes. If the call returns a 401, the catch block at lines 62–67 deletes all tokens and clears the store — before the user has seen a single screen.'),
        p('This means any token expiration event that happens while the app is closed results in a forced logout on the very next open, with no opportunity for silent re-auth.'),
        ...spacer(1),

        h2('RC-3 · Short Server-Side Sanctum Token Lifetime'),
        p('File: Laravel backend  ·  config/sanctum.php'),
        p('Laravel Sanctum\'s SANCTUM_EXPIRATION setting controls how long API tokens remain valid. The default is null (non-expiring), but many production deployments set this to 60–480 minutes for security compliance. When a token expires, the next API call returns 401. Combined with RC-1 and RC-2, this is the direct trigger for every user-reported logout after a period of inactivity.'),
        ...spacer(1),

        h2('RC-4 · No Refresh or Silent Re-authentication'),
        p('Files: src/api/client.ts, src/api/auth.ts'),
        p('There is no token refresh endpoint call and no silent re-login attempt anywhere in the client code. The app stores "remember me" credentials in login.tsx (lines 61–64) via SecureStore, but never uses them to re-authenticate automatically. This means the 401 → logout path is the only possible outcome when a token expires.'),
        ...spacer(1),

        h2('RC-5 · Dual-Storage Inconsistency'),
        p('Files: src/store/appStore.ts, app/_layout.tsx, app/(auth)/login.tsx'),
        p('Auth data is written to two separate storage locations on login:'),
        bullet('Individual SecureStore keys (sanctum_token, auth_user, auth_restaurant) — written by login.tsx, read by the _layout.tsx bootstrap.'),
        bullet('Zustand persist store (key: cspos-app-store) — written automatically by the persist middleware when setAuth() is called.'),
        p('When the 401 interceptor fires (RC-1), it deletes the individual keys but the Zustand persist store still contains stale copies. On the next app open, _layout.tsx reads from the individual keys (now gone), finds no token, and skips session restoration — even though the Zustand hydration would have found a valid token.'),
        ...spacer(1),

        // ═══════════════════════════════════════════════════════════════════
        h1('3. Implementation Plan'),
        p('Five targeted fixes address every root cause. They are ordered so that each one improves the situation independently; together they deliver a permanent, enterprise-grade solution.'),
        ...spacer(1),

        h2('Fix 1 · Replace the 401 Interceptor with Retry + Silent Re-auth'),
        p('File: src/api/client.ts  ·  Full replacement of the response interceptor'),
        p('The new interceptor follows this decision tree on any 401 response:'),
        numbered('Skip auth routes (login, logout) — pass through unchanged.'),
        numbered('If device is offline — reject the error but do NOT clear auth. The token is still valid; the network is not.'),
        numbered('If a refresh is already in progress — queue the request and wait for the result.'),
        numbered('Attempt silent re-authentication using saved "remember me" credentials.'),
        numbered('If re-auth succeeds — retry the original request with the new token. Release queued requests.'),
        numbered('If re-auth fails — session is genuinely invalid. Call performLogout() and redirect to login.'),
        ...spacer(1),
        code('// src/api/client.ts  — COMPLETE REPLACEMENT'),
        code('import axios from "axios";'),
        code('import { Platform } from "react-native";'),
        code('import { getItem, setItem, deleteItem } from "@/utils/storage";'),
        code(''),
        code('export const API_BASE_URL = "https://restaurant.softwar.in/api/mobile";'),
        code(''),
        code('const client = axios.create({'),
        code('  baseURL: API_BASE_URL,'),
        code('  timeout: 30000,'),
        code('  headers: { "Content-Type": "application/json", Accept: "application/json" },'),
        code('});'),
        code(''),
        code('// ── Request interceptor: attach token ─────────────────────────────'),
        code('client.interceptors.request.use(async (config) => {'),
        code('  const token = await getItem("sanctum_token");'),
        code('  if (token) config.headers.Authorization = `Bearer ${token}`;'),
        code('  return config;'),
        code('});'),
        code(''),
        code('// ── Refresh state ─────────────────────────────────────────────────'),
        code('let isRefreshing = false;'),
        code('let pending: Array<(token: string | null) => void> = [];'),
        code('function releasePending(token: string | null) {'),
        code('  pending.forEach(fn => fn(token));'),
        code('  pending = [];'),
        code('}'),
        code(''),
        code('// ── Helpers ───────────────────────────────────────────────────────'),
        code('async function isDeviceOnline(): Promise<boolean> {'),
        code('  if (Platform.OS === "web") return typeof navigator !== "undefined" && navigator.onLine;'),
        code('  try {'),
        code('    const { useAppStore } = await import("@/store/appStore");'),
        code('    return useAppStore.getState().isOnline;'),
        code('  } catch { return true; }'),
        code('}'),
        code(''),
        code('async function silentReauth(): Promise<string | null> {'),
        code('  try {'),
        code('    const saved = await getItem("remember_me_credentials");'),
        code('    if (!saved) return null;'),
        code('    const { email, password } = JSON.parse(saved);'),
        code('    // Use plain axios to avoid triggering this interceptor again'),
        code('    const res = await axios.post(`${API_BASE_URL}/auth/login`, { email, password },'),
        code('      { headers: { "Content-Type": "application/json", Accept: "application/json" } });'),
        code('    const { token, user, restaurant } = res.data;'),
        code('    await setItem("sanctum_token", token);'),
        code('    await setItem("auth_user", JSON.stringify(user));'),
        code('    await setItem("auth_restaurant", JSON.stringify(restaurant));'),
        code('    const { useAppStore } = await import("@/store/appStore");'),
        code('    useAppStore.getState().setAuth(user, restaurant, token);'),
        code('    return token;'),
        code('  } catch { return null; }'),
        code('}'),
        code(''),
        code('async function performLogout() {'),
        code('  await deleteItem("sanctum_token");'),
        code('  await deleteItem("auth_user");'),
        code('  await deleteItem("auth_restaurant");'),
        code('  try {'),
        code('    const { useAppStore } = await import("@/store/appStore");'),
        code('    const { router } = await import("expo-router");'),
        code('    useAppStore.getState().clearAuth();'),
        code('    router.replace("/(auth)/login");'),
        code('  } catch {'),
        code('    if (Platform.OS === "web" && typeof window !== "undefined")'),
        code('      window.location.href = "/";'),
        code('  }'),
        code('}'),
        code(''),
        code('// ── Response interceptor: resilient 401 handling ──────────────────'),
        code('client.interceptors.response.use('),
        code('  (res) => res,'),
        code('  async (error) => {'),
        code('    const orig = error.config;'),
        code('    if (error.response?.status !== 401) return Promise.reject(error);'),
        code(''),
        code('    // Never intercept auth routes themselves'),
        code('    const url = orig?.url ?? "";'),
        code('    if (url.includes("/auth/login") || url.includes("/auth/logout"))'),
        code('      return Promise.reject(error);'),
        code(''),
        code('    // Offline: reject but keep session intact'),
        code('    if (!(await isDeviceOnline())) return Promise.reject(error);'),
        code(''),
        code('    // Already refreshing: queue this request'),
        code('    if (isRefreshing) {'),
        code('      return new Promise((resolve, reject) => {'),
        code('        pending.push((newToken) => {'),
        code('          if (!newToken) return reject(error);'),
        code('          orig.headers.Authorization = `Bearer ${newToken}`;'),
        code('          resolve(client(orig));'),
        code('        });'),
        code('      });'),
        code('    }'),
        code(''),
        code('    // Attempt silent re-auth'),
        code('    isRefreshing = true;'),
        code('    const newToken = await silentReauth();'),
        code('    isRefreshing = false;'),
        code(''),
        code('    if (newToken) {'),
        code('      releasePending(newToken);'),
        code('      orig.headers.Authorization = `Bearer ${newToken}`;'),
        code('      return client(orig); // Retry original request'),
        code('    }'),
        code(''),
        code('    // Re-auth failed — genuine session expiry'),
        code('    releasePending(null);'),
        code('    await performLogout();'),
        code('    return Promise.reject(error);'),
        code('  }'),
        code(');'),
        code(''),
        code('export default client;'),
        ...spacer(1),

        h2('Fix 2 · Offline-First Bootstrap'),
        p('File: app/_layout.tsx  ·  Replace lines 44–71'),
        p('Change the bootstrap to restore auth immediately from local storage (non-blocking), then validate with the server in the background. The user sees their app immediately; the server check is a silent background task.'),
        ...spacer(1),
        code('// app/_layout.tsx — REPLACE the auth section in bootstrap()'),
        code(''),
        code('// Step 1: Restore from local storage immediately (no network needed)'),
        code('const token          = await getItem("sanctum_token");'),
        code('const userJson       = await getItem("auth_user");'),
        code('const restaurantJson = await getItem("auth_restaurant");'),
        code(''),
        code('if (token && userJson && restaurantJson) {'),
        code('  setAuth(JSON.parse(userJson), JSON.parse(restaurantJson), token);'),
        code('}'),
        code(''),
        code('// Unblock the UI immediately — do not wait for network'),
        code('setHydrated();'),
        code(''),
        code('// Step 2: Background server validation (non-blocking, no await)'),
        code('if (token && userJson && restaurantJson) {'),
        code('  (async () => {'),
        code('    try {'),
        code('      const { authApi } = await import("@/api/auth");'),
        code('      const meRes = await authApi.me();'),
        code('      const me   = meRes.data?.user ?? meRes.data;'),
        code('      const rest = meRes.data?.restaurant ?? JSON.parse(restaurantJson);'),
        code('      if (me) {'),
        code('        setAuth(me, rest, token);'),
        code('        await setItem("auth_user", JSON.stringify(me));'),
        code('        if (rest) await setItem("auth_restaurant", JSON.stringify(rest));'),
        code('      }'),
        code('    } catch (e: any) {'),
        code('      // A 401 here is handled by Fix 1\'s interceptor (silentReauth).'),
        code('      // Network errors (no e.response) are silently ignored.'),
        code('      // The user stays logged in.'),
        code('      if (e?.response?.status === 401) {'),
        code('        console.warn("[Bootstrap] Token expired — interceptor handling re-auth");'),
        code('      }'),
        code('    }'),
        code('  })();'),
        code('}'),
        ...spacer(1),

        h2('Fix 3 · Extend Server-Side Sanctum Token Lifetime'),
        p('File: Laravel backend  ·  .env and config/sanctum.php'),
        p('Set SANCTUM_EXPIRATION to null (non-expiring tokens) for POS devices. The security boundary is explicit logout (which revokes the token server-side), not expiration.'),
        ...spacer(1),
        code('# .env'),
        code('SANCTUM_EXPIRATION=null'),
        code(''),
        code('# config/sanctum.php'),
        code("'expiration' => env('SANCTUM_EXPIRATION', null),"),
        ...spacer(1),
        p('Additionally, add a /auth/refresh endpoint so the client can proactively renew tokens without re-entering credentials (used by Fix 5):'),
        code('// routes/api.php — inside auth:sanctum middleware group'),
        code('Route::post("/auth/refresh", function (Request $request) {'),
        code('    $user = $request->user();'),
        code('    $request->user()->currentAccessToken()->delete();'),
        code('    $token = $user->createToken("mobile")->plainTextToken;'),
        code('    return response()->json(["token" => $token]);'),
        code('});'),
        ...spacer(1),

        h2('Fix 4 · Unify Token Storage — Single Source of Truth'),
        p('Files: app/(auth)/login.tsx, app/_layout.tsx'),
        p('Write all auth data exclusively through setAuth() (which the Zustand persist middleware automatically saves to SecureStore). Remove the separate setItem("sanctum_token") calls in login.tsx. The _layout.tsx bootstrap continues to read from individual keys during the transition period; once all clients are updated, it too should read from the Zustand store.'),
        ...spacer(1),
        code('// app/(auth)/login.tsx — handleLogin() SIMPLIFIED'),
        code('const { token, user, restaurant } = res.data;'),
        code(''),
        code('// Write ONLY to Zustand (which persists to SecureStore automatically)'),
        code('setAuth(user, restaurant, token);'),
        code(''),
        code('// "remember me" credentials remain separate (for silent re-auth)'),
        code('if (rememberMe) {'),
        code('  await setItem("remember_me_credentials", JSON.stringify({ email, password }));'),
        code('} else {'),
        code('  await deleteItem("remember_me_credentials");'),
        code('}'),
        code(''),
        code('// REMOVE these three lines — no longer needed:'),
        code('// await setItem("sanctum_token", token);      ← DELETE'),
        code('// await setItem("auth_user", JSON.stringify(user));    ← DELETE'),
        code('// await setItem("auth_restaurant", JSON.stringify(restaurant)); ← DELETE'),
        ...spacer(1),

        h2('Fix 5 · Proactive Token Refresh on App Foreground'),
        p('File: hooks/useTokenRefresh.ts (new file)'),
        p('Add an AppState listener that silently refreshes the token whenever the app returns to foreground after more than 1 hour. This prevents the first API call after a long sleep from encountering an expired token and triggering the re-auth flow.'),
        ...spacer(1),
        code('// hooks/useTokenRefresh.ts  — NEW FILE'),
        code('import { useEffect, useRef } from "react";'),
        code('import { AppState, Platform } from "react-native";'),
        code('import { useAppStore } from "@/store/appStore";'),
        code('import { getItem, setItem } from "@/utils/storage";'),
        code('import axios from "axios";'),
        code('import { API_BASE_URL } from "@/api/client";'),
        code(''),
        code('const REFRESH_AFTER_MS = 60 * 60 * 1000; // 1 hour'),
        code(''),
        code('export function useTokenRefresh() {'),
        code('  const lastActive = useRef(Date.now());'),
        code(''),
        code('  useEffect(() => {'),
        code('    if (Platform.OS === "web") {'),
        code('      // Web: use Page Visibility API'),
        code('      const onVisible = async () => {'),
        code('        if (document.visibilityState !== "visible") return;'),
        code('        if (Date.now() - lastActive.current < REFRESH_AFTER_MS) return;'),
        code('        await refreshToken();'),
        code('        lastActive.current = Date.now();'),
        code('      };'),
        code('      document.addEventListener("visibilitychange", onVisible);'),
        code('      return () => document.removeEventListener("visibilitychange", onVisible);'),
        code('    }'),
        code(''),
        code('    // Native: use AppState'),
        code('    const sub = AppState.addEventListener("change", async (state) => {'),
        code('      if (state !== "active") return;'),
        code('      if (Date.now() - lastActive.current < REFRESH_AFTER_MS) return;'),
        code('      await refreshToken();'),
        code('      lastActive.current = Date.now();'),
        code('    });'),
        code('    return () => sub.remove();'),
        code('  }, []);'),
        code('}'),
        code(''),
        code('async function refreshToken() {'),
        code('  try {'),
        code('    const token = await getItem("sanctum_token");'),
        code('    if (!token) return;'),
        code('    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {},'),
        code('      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });'),
        code('    const newToken: string = res.data.token;'),
        code('    await setItem("sanctum_token", newToken);'),
        code('    const { user, restaurant, setAuth } = useAppStore.getState();'),
        code('    if (user && restaurant) setAuth(user, restaurant, newToken);'),
        code('  } catch { /* silent — Fix 1 handles 401 if the next request fails */ }'),
        code('}'),
        code(''),
        code('// Usage — add to app/(app)/_layout.tsx'),
        code('// import { useTokenRefresh } from "@/hooks/useTokenRefresh";'),
        code('// export default function AppLayout() {'),
        code('//   useTokenRefresh();'),
        code('//   ...'),
        code('// }'),
        ...spacer(1),

        // ═══════════════════════════════════════════════════════════════════
        h1('4. Security Considerations'),
        p('Long-lived or non-expiring tokens do not weaken security when the following controls are in place:'),
        ...spacer(1),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2600, 6760],
          rows: [
            tableRow([{ text: 'Control', width: 2600 }, { text: 'Implementation', width: 6760 }], true),
            tableRow([{ text: 'Explicit logout', width: 2600 }, { text: 'The logout button calls authApi.logout() which issues a DELETE on the Sanctum token server-side, making it permanently invalid regardless of expiration setting', width: 6760 }]),
            tableRow([{ text: 'Secure storage', width: 2600 }, { text: 'expo-secure-store uses Keychain on iOS and EncryptedSharedPreferences on Android. Tokens are encrypted at rest and inaccessible to other apps', width: 6760 }]),
            tableRow([{ text: 'Transport security', width: 2600 }, { text: 'All API calls use HTTPS only. Tokens are never sent over plaintext connections', width: 6760 }]),
            tableRow([{ text: 'Admin revocation', width: 2600 }, { text: 'Tokens can be revoked at any time from the Laravel admin panel via the personal_access_tokens table, without requiring the user to be online', width: 6760 }]),
            tableRow([{ text: 'Credential storage consent', width: 2600 }, { text: 'Silent re-auth credentials are only stored when the user explicitly checks "Remember me". On shared or kiosk devices, disable this option by default', width: 6760 }]),
          ],
        }),
        ...spacer(1),

        // ═══════════════════════════════════════════════════════════════════
        h1('5. Testing Checklist'),
        p('Validate each scenario after all five fixes are deployed:'),
        ...spacer(1),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3400, 3200, 2760],
          rows: [
            tableRow([{ text: 'Scenario', width: 3400 }, { text: 'Expected Result', width: 3200 }, { text: 'Fix(es)', width: 2760 }], true),
            tableRow([{ text: 'Close and immediately reopen app', width: 3400 }, { text: 'User remains logged in, no login flash', width: 3200 }, { text: 'Fix 2, 4', width: 2760 }]),
            tableRow([{ text: 'Device reboot', width: 3400 }, { text: 'User remains logged in after reboot', width: 3200 }, { text: 'Fix 2, 4', width: 2760 }]),
            tableRow([{ text: 'App backgrounded 30+ minutes', width: 3400 }, { text: 'On foreground: token silently refreshed, no login prompt', width: 3200 }, { text: 'Fix 5', width: 2760 }]),
            tableRow([{ text: 'Server restart during active session', width: 3400 }, { text: 'Silent re-auth fires, user never sees login screen', width: 3200 }, { text: 'Fix 1', width: 2760 }]),
            tableRow([{ text: 'Device goes offline then online', width: 3400 }, { text: 'Session preserved offline; sync runs on reconnect', width: 3200 }, { text: 'Fix 1', width: 2760 }]),
            tableRow([{ text: 'App opened with zero network', width: 3400 }, { text: 'User stays logged in; offline mode functions', width: 3200 }, { text: 'Fix 2', width: 2760 }]),
            tableRow([{ text: 'Ticket poll returns 401 mid-session', width: 3400 }, { text: 'Silent re-auth, poll continues, user unaffected', width: 3200 }, { text: 'Fix 1', width: 2760 }]),
            tableRow([{ text: 'Sanctum token expires (server confirms)', width: 3400 }, { text: 'Silent re-login using saved credentials, session continues', width: 3200 }, { text: 'Fix 1, 3', width: 2760 }]),
            tableRow([{ text: 'Remember Me not checked + token expires', width: 3400 }, { text: 'User shown login screen (expected — no saved credentials)', width: 3200 }, { text: 'Fix 1', width: 2760 }]),
            tableRow([{ text: 'Manual logout via button', width: 3400 }, { text: 'Token revoked server-side, redirected to login', width: 3200 }, { text: 'Existing', width: 2760 }]),
            tableRow([{ text: '5xx server error on any API call', width: 3400 }, { text: 'Error surfaced in UI; user not logged out', width: 3200 }, { text: 'Fix 1', width: 2760 }]),
          ],
        }),
        ...spacer(1),

        // ═══════════════════════════════════════════════════════════════════
        h1('6. Deployment Order'),
        p('Apply in this sequence to avoid a regression window between server and client changes:'),
        ...spacer(1),
        numbered('Fix 3 (Server) — Update SANCTUM_EXPIRATION in .env and deploy the /auth/refresh route. Zero downtime; existing tokens remain valid.'),
        numbered('Fix 1 (Client) — Replace the 401 interceptor. This is the highest-impact change. Can be deployed standalone.'),
        numbered('Fix 2 (Client) — Update _layout.tsx bootstrap to offline-first. Eliminates the login flash on slow networks.'),
        numbered('Fix 4 (Client) — Simplify login.tsx storage writes. Eliminates the dual-storage split-brain.'),
        numbered('Fix 5 (Client) — Add useTokenRefresh hook. Requires Fix 3\'s /auth/refresh endpoint to be live.'),
        ...spacer(1),
        pRuns([
          { text: 'Estimated effort: ', bold: true },
          { text: 'Fix 1 + Fix 2 in under 1 hour. All five fixes in 2–4 hours for a single developer.' },
        ]),
        ...spacer(1),

        // ═══════════════════════════════════════════════════════════════════
        h1('7. Cross-Platform Compatibility'),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1800, 2520, 2520, 2520],
          rows: [
            tableRow([
              { text: 'Concern', width: 1800 }, { text: 'iOS', width: 2520 },
              { text: 'Android', width: 2520 }, { text: 'Web / Electron', width: 2520 },
            ], true),
            tableRow([{ text: 'Token storage', width: 1800 }, { text: 'Keychain via expo-secure-store', width: 2520 }, { text: 'EncryptedSharedPreferences via expo-secure-store', width: 2520 }, { text: 'localStorage (Electron: safeStorage for encryption)', width: 2520 }]),
            tableRow([{ text: 'Offline detection', width: 1800 }, { text: '@react-native-community/netinfo', width: 2520 }, { text: '@react-native-community/netinfo', width: 2520 }, { text: 'navigator.onLine + window online/offline events', width: 2520 }]),
            tableRow([{ text: 'Foreground event', width: 1800 }, { text: 'AppState "active"', width: 2520 }, { text: 'AppState "active"', width: 2520 }, { text: 'document visibilitychange', width: 2520 }]),
            tableRow([{ text: 'Fix 5 hook', width: 1800 }, { text: 'Works out of the box', width: 2520 }, { text: 'Works out of the box', width: 2520 }, { text: 'Uses visibilitychange branch in useTokenRefresh', width: 2520 }]),
            tableRow([{ text: 'Fix 1 interceptor', width: 1800 }, { text: 'Platform-agnostic Axios', width: 2520 }, { text: 'Platform-agnostic Axios', width: 2520 }, { text: 'navigator.onLine check replaces isOnline store read', width: 2520 }]),
          ],
        }),
        ...spacer(1),

        // ═══════════════════════════════════════════════════════════════════
        h1('8. Summary'),
        p('The auto-logout issue is caused by five compounding defects, with the aggressive 401 interceptor and the synchronous bootstrap validation being the most impactful. No single backend configuration change is sufficient; both the server-side token lifetime and the client-side resilience logic must be addressed.'),
        p('After applying all five fixes, the app will deliver an enterprise-grade authentication experience:'),
        bullet('Users remain logged in permanently across restarts, reboots, and long periods of inactivity.'),
        bullet('Background polling and sync tasks can encounter 401 errors without affecting the user session.'),
        bullet('The session is silently renewed in the background without any user-visible login prompt.'),
        bullet('Offline mode is fully supported — auth is restored from secure local storage, not the network.'),
        bullet('Explicit logout cleanly revokes the server-side token and clears all local state.'),
        ...spacer(1),
        p('This matches the session model of WhatsApp, Gmail, Uber, and all other modern enterprise mobile applications.'),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync('/sessions/jolly-keen-gauss/mnt/mobile/Authentication_Architecture_Report.docx', buf);
  console.log('Done → Authentication_Architecture_Report.docx');
}).catch(e => { console.error(e); process.exit(1); });
