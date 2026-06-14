import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
  Alert, useWindowDimensions, Modal, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Linking, Image, ActivityIndicator,
} from 'react-native';
import { Share } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTables, upsertTables, updateTableStatus, deleteTableLocal } from '@/database/repositories';
import { webGetTables, webSaveTables, webUpdateTableStatus, webPutTable, webDeleteTable } from '@/utils/webDb';
import { syncService } from '@/sync/SyncService';
import { useAppStore } from '@/store/appStore';
import client from '@/api/client';
import type { RestaurantTable } from '@/types';
import { useThemedScreen } from '@/theme/useThemedScreen';

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND_RED    = '#ef4444';
const BRAND_PURPLE = '#7c3aed';
const FRAME_BG     = BRAND_PURPLE; // solid color to simulate the red→purple gradient frame

const STATUS_CFG = {
  available: { label: 'Available', badge: '#dcfce7', text: '#15803d' },
  occupied:  { label: 'Occupied',  badge: '#fef9c3', text: '#a16207' },
  reserved:  { label: 'Reserved',  badge: '#fee2e2', text: '#b91c1c' },
};

type ViewMode = 'grid' | 'list';
const EMPTY_FORM = { table_number: '', name: '', floor: '', capacity: '4', status: 'available' as RestaurantTable['status'] };
type FormField   = keyof typeof EMPTY_FORM;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TablesScreen() {
  const t              = useThemedScreen();
  const { isOnline, user, restaurant } = useAppStore();
  const restaurantName = restaurant?.name?.toUpperCase() ?? 'RESTAURANT';
  const isSuperAdmin   = user?.role === 'super_admin' || user?.role === 'restaurant_admin';

  const [tables,      setTables]      = useState<RestaurantTable[]>([]);
  const [refreshing,  setRefreshing]  = useState(false);
  const [viewMode,    setViewMode]    = useState<ViewMode>('grid');
  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState<RestaurantTable | null>(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [qrTable,     setQrTable]     = useState<RestaurantTable | null>(null);
  const { width }     = useWindowDimensions();
  const cols          = width >= 1200 ? 4 : width >= 900 ? 3 : width >= 600 ? 2 : 1;

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        const res = await client.get('/tables');
        const tbls: RestaurantTable[] = res.data?.data ?? res.data ?? [];
        if (Array.isArray(tbls) && tbls.length > 0) {
          await webSaveTables(tbls);
          setTables(tbls);
          return;
        }
      } catch {}
      try {
        const res = await client.get('/sync/pull');
        const tbls: RestaurantTable[] = res.data?.tables ?? [];
        if (tbls.length > 0) { await webSaveTables(tbls); setTables(tbls); return; }
      } catch {}
      setTables(await webGetTables());
    } else {
      setTables(await getTables());
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleRefresh() {
    setRefreshing(true);
    try { if (isOnline) await syncService.manualSync(); } catch {}
    await load();
    setRefreshing(false);
  }

  // ── Status cycle ──────────────────────────────────────────────────────────

  async function cycleStatus(table: RestaurantTable) {
    if (table.has_active_order) {
      Alert.alert('Occupied', 'This table has an active order. Complete or cancel the order first.');
      return;
    }
    const cycle: RestaurantTable['status'][] = ['available', 'occupied', 'reserved'];
    const next = cycle[(cycle.indexOf(table.status) + 1) % cycle.length];
    try {
      if (Platform.OS === 'web') await webUpdateTableStatus(table.id, next);
      else await updateTableStatus(table.id, next);
      if (isOnline) await client.patch(`/tables/${table.id}/status`, { status: next });
      await load();
    } catch { Alert.alert('Error', 'Could not update table status.'); }
  }

  // ── Add / Edit ────────────────────────────────────────────────────────────

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setShowForm(true);
  }

  function openEdit(table: RestaurantTable) {
    setForm({
      table_number: table.table_number ? String(table.table_number) : '',
      name:     table.name,
      floor:    table.floor ?? '',
      capacity: table.capacity ? String(table.capacity) : '4',
      status:   table.status,
    });
    setEditTarget(table);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert('Validation', 'Table name is required.'); return; }
    const cap = parseInt(form.capacity || '4', 10);
    if (isNaN(cap) || cap < 1 || cap > 50) { Alert.alert('Validation', 'Capacity must be 1–50.'); return; }
    const num = form.table_number ? parseInt(form.table_number, 10) : null;
    if (form.table_number && (isNaN(num!) || num! < 1 || num! > 999)) { Alert.alert('Validation', 'Table number must be 1–999.'); return; }

    setSaving(true);
    try {
      const payload = { table_number: num, name: form.name.trim(), floor: form.floor.trim() || null, capacity: cap, status: form.status };
      const res = editTarget
        ? await client.put(`/tables/${editTarget.id}`, payload)
        : await client.post('/tables', payload);
      const saved: RestaurantTable = res.data.table;
      if (Platform.OS === 'web') await webPutTable(saved);
      else await upsertTables([saved]);
      setShowForm(false);
      await load();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.response?.data?.errors?.name?.[0] ?? 'Could not save table.';
      Alert.alert('Error', msg);
    } finally { setSaving(false); }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  function handleDelete(table: RestaurantTable) {
    Alert.alert('Delete Table', `Delete "${table.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await client.delete(`/tables/${table.id}`);
          if (Platform.OS === 'web') await webDeleteTable(table.id);
          else await deleteTableLocal(table.id);
          await load();
        } catch (err: any) { Alert.alert('Error', err?.response?.data?.message ?? 'Could not delete table.'); }
      }},
    ]);
  }

  // ── Share ─────────────────────────────────────────────────────────────────

  async function handleShare(table: RestaurantTable) {
    const url = table.qr_url;
    if (!url) { Alert.alert('Unavailable', 'Sync first to get the QR link.'); return; }
    const label = table.table_number ? `Table Number - ${table.table_number}` : table.name;
    try { await Share.share({ message: `Order at ${restaurantName} — ${label}\n${url}`, url, title: label }); } catch {}
  }

  async function handleWhatsApp(table: RestaurantTable) {
    const url = table.qr_url;
    if (!url) return;
    const label = table.table_number ? `Table Number - ${table.table_number}` : table.name;
    const msg = encodeURIComponent(`Order at ${restaurantName} — ${label}\n${url}`);
    Linking.openURL(`https://wa.me/?text=${msg}`);
  }

  // ─────────────────────────────────────────────────────────────────────────

  // Pad grid data so the last row is always complete (prevents last item stretching full-width)
  type GridItem = RestaurantTable | { id: string; _ghost: true };
  const gridData = useMemo<GridItem[]>(() => {
    if (cols <= 1) return tables;
    const rem = tables.length % cols;
    if (rem === 0) return tables;
    const ghosts = Array.from({ length: cols - rem }, (_, i) => ({ id: `ghost-${i}`, _ghost: true as const }));
    return [...tables, ...ghosts];
  }, [tables, cols]);

  // Stats
  const stats = {
    available: tables.filter(t => t.status === 'available' && !t.has_active_order).length,
    occupied:  tables.filter(t => t.status === 'occupied'  || t.has_active_order).length,
    reserved:  tables.filter(t => t.status === 'reserved'  && !t.has_active_order).length,
  };

  return (
    <View style={[s.root, t.shell]}>

      {/* ── Page header ── */}
      <View style={s.pageHeader}>
        <View style={s.pageHeaderLeft}>
          <Text style={s.pageTitle}>Tables</Text>
          {restaurant?.name ? <Text style={s.pageRestaurant}>– {restaurant.name}</Text> : null}
        </View>
        <View style={s.pageHeaderRight}>
          {/* Stats pills */}
          <View style={s.statsPills}>
            {(Object.entries(stats) as [keyof typeof stats, number][]).map(([key, n]) => (
              <View key={key} style={[s.pill, { backgroundColor: STATUS_CFG[key].badge }]}>
                <Text style={[s.pillText, { color: STATUS_CFG[key].text }]}>{n} {STATUS_CFG[key].label}</Text>
              </View>
            ))}
          </View>
          {/* View toggle */}
          {tables.length > 0 && (
            <View style={s.viewToggle}>
              <TouchableOpacity style={[s.viewBtn, viewMode === 'grid' && s.viewBtnOn]} onPress={() => setViewMode('grid')}>
                <Ionicons name="grid-outline" size={16} color={viewMode === 'grid' ? '#fff' : '#64748b'} />
              </TouchableOpacity>
              <TouchableOpacity style={[s.viewBtn, viewMode === 'list' && s.viewBtnOn]} onPress={() => setViewMode('list')}>
                <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? '#fff' : '#64748b'} />
              </TouchableOpacity>
            </View>
          )}
          {isSuperAdmin && (
            <TouchableOpacity style={s.addBtn} onPress={openAdd}>
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text style={s.addBtnTxt}>Add New</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Grid View ── */}
      {viewMode === 'grid' ? (
        <FlatList
          data={gridData}
          keyExtractor={item => String(item.id)}
          numColumns={cols}
          key={`g-${cols}`}
          columnWrapperStyle={cols > 1 ? s.colWrap : undefined}
          contentContainerStyle={s.gridPad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={BRAND_PURPLE} />}
          renderItem={({ item }) => {
            if ((item as any)._ghost) return <View style={s.cardGhost} />;
            return (
              <QrCard
                table={item as RestaurantTable}
                restaurantName={restaurantName}
                isSuperAdmin={isSuperAdmin}
                cols={cols}
                onTap={cycleStatus}
                onEdit={openEdit}
                onDelete={handleDelete}
                onQr={setQrTable}
                onShare={handleShare}
                onWhatsApp={handleWhatsApp}
              />
            );
          }}
          ListEmptyComponent={<EmptyState />}
        />
      ) : (
        /* ── List View ── */
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={BRAND_PURPLE} />}
          contentContainerStyle={s.listPad}
        >
          {tables.length === 0 ? <EmptyState /> : (
            <View style={s.listCard}>
              {/* Header row */}
              <View style={[s.listRow, s.listHeaderRow]}>
                <Text style={[s.listCell, s.listColQr,   s.hdrTxt]}>QR</Text>
                <Text style={[s.listCell, s.listColName, s.hdrTxt]}>Table</Text>
                <Text style={[s.listCell, s.listColFloor,s.hdrTxt]}>Floor</Text>
                <Text style={[s.listCell, s.listColCap,  s.hdrTxt, { textAlign: 'center' }]}>Cap.</Text>
                <Text style={[s.listCell, s.listColSt,   s.hdrTxt]}>Status</Text>
                <Text style={[s.listCell, s.listColAct,  s.hdrTxt, { textAlign: 'right' }]}>Actions</Text>
              </View>
              {tables.map((table, i) => (
                <ListRow
                  key={table.id}
                  table={table}
                  isSuperAdmin={isSuperAdmin}
                  isLast={i === tables.length - 1}
                  onTap={cycleStatus}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onQr={setQrTable}
                  onShare={handleShare}
                  onWhatsApp={handleWhatsApp}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── QR Fullscreen Modal ── */}
      {qrTable && (
        <QrFullModal
          table={qrTable}
          restaurantName={restaurantName}
          onClose={() => setQrTable(null)}
          onShare={handleShare}
          onWhatsApp={handleWhatsApp}
        />
      )}

      {/* ── Add / Edit Form ── */}
      <TableFormModal
        visible={showForm}
        isEdit={!!editTarget}
        form={form}
        saving={saving}
        onChange={(f, v) => setForm(prev => ({ ...prev, [f]: v }))}
        onSave={handleSave}
        onClose={() => setShowForm(false)}
      />
    </View>
  );
}

// ─── QR Card (Grid Item) ──────────────────────────────────────────────────────

function QrCard({
  table, restaurantName, isSuperAdmin, cols,
  onTap, onEdit, onDelete, onQr, onShare, onWhatsApp,
}: {
  table: RestaurantTable; restaurantName: string; isSuperAdmin: boolean; cols: number;
  onTap: (t: RestaurantTable) => void;
  onEdit: (t: RestaurantTable) => void;
  onDelete: (t: RestaurantTable) => void;
  onQr: (t: RestaurantTable) => void;
  onShare: (t: RestaurantTable) => void;
  onWhatsApp: (t: RestaurantTable) => void;
}) {
  const cfg   = STATUS_CFG[table.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.available;
  const label = table.table_number ? `Table Number - ${table.table_number}` : table.name;
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgOk,    setImgOk]    = useState(true);

  return (
    <View style={[s.cardOuter, cols === 1 && { marginHorizontal: 0 }]}>
      {/* Gradient-simulated frame (solid purple border with 2.5px padding) */}
      <View style={s.cardFrame}>
        <View style={s.cardInner}>

          {/* ── Card Header ── */}
          <View style={s.cardHead}>
            <Text style={s.cardTitle}>OrderByQR</Text>
            <Text style={s.cardRestaurant}>{restaurantName}</Text>
            <Text style={s.cardTableLabel}>{label}</Text>
          </View>

          {/* ── QR Code ── */}
          <TouchableOpacity style={s.qrBox} onPress={() => table.qr_image_url && onQr(table)} activeOpacity={0.85}>
            <View style={s.qrFrame2}>
              <View style={s.qrInner2}>
                {table.qr_image_url && imgOk ? (
                  <Image
                    source={{ uri: table.qr_image_url }}
                    style={s.qrImg}
                    resizeMode="contain"
                    onError={() => setImgOk(false)}
                  />
                ) : (
                  <Ionicons name="qr-code-outline" size={80} color="#c4b5fd" />
                )}
              </View>
            </View>
          </TouchableOpacity>

          {/* ── Action icons ── */}
          <View style={s.actionRow}>
            <IconBtn icon="download-outline"      color="#475569" bg="#f1f5f9" border="#e2e8f0" onPress={() => onShare(table)} />
            <IconBtn icon="logo-whatsapp"          color="#059669" bg="#ecfdf5" border="#d1fae5" onPress={() => onWhatsApp(table)} />
            <IconBtn icon="mail-outline"           color="#4f46e5" bg="#eef2ff" border="#e0e7ff" onPress={() => onShare(table)} />
            {isSuperAdmin && (
              <IconBtn icon="print-outline" color="#0284c7" bg="#f0f9ff" border="#e0f2fe" onPress={() => table.qr_url && Linking.openURL(table.qr_url)} />
            )}
          </View>

          {/* ── Footer ── */}
          <View style={s.cardFooter}>
            <View style={s.footerLeft}>
              <Text style={s.footerMeta}>
                Floor: {table.floor || '–'} | Capacity: {table.capacity ?? '–'}
              </Text>
              <View style={[s.badge, { backgroundColor: cfg.badge }]}>
                <Text style={[s.badgeTxt, { color: cfg.text }]}>{cfg.label}</Text>
              </View>
            </View>

            <View style={s.footerRight}>
              {isSuperAdmin && (
                <View>
                  <TouchableOpacity onPress={() => setMenuOpen(v => !v)} style={s.dotMenuBtn} hitSlop={8}>
                    <Ionicons name="ellipsis-vertical" size={18} color="#64748b" />
                  </TouchableOpacity>
                  {menuOpen && (
                    <View style={s.dropMenu}>
                      <TouchableOpacity style={s.dropItem} onPress={() => { setMenuOpen(false); onEdit(table); }}>
                        <Ionicons name="pencil-outline" size={14} color="#475569" />
                        <Text style={s.dropItemTxt}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.dropItem} onPress={() => { setMenuOpen(false); onDelete(table); }}>
                        <Ionicons name="trash-outline" size={14} color="#dc2626" />
                        <Text style={[s.dropItemTxt, { color: '#dc2626' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
              <Text style={s.powered}>
                Powered by <Text style={s.poweredBrand}>IT Softwar</Text>
              </Text>
            </View>
          </View>

        </View>
      </View>
    </View>
  );
}

function IconBtn({ icon, color, bg, border, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string; bg: string; border: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[s.iconBtn, { backgroundColor: bg, borderColor: border }]} onPress={onPress} hitSlop={6}>
      <Ionicons name={icon} size={16} color={color} />
    </TouchableOpacity>
  );
}

// ─── List Row ─────────────────────────────────────────────────────────────────

function ListRow({
  table, isSuperAdmin, isLast,
  onTap, onEdit, onDelete, onQr, onShare, onWhatsApp,
}: {
  table: RestaurantTable; isSuperAdmin: boolean; isLast: boolean;
  onTap: (t: RestaurantTable) => void;
  onEdit: (t: RestaurantTable) => void;
  onDelete: (t: RestaurantTable) => void;
  onQr: (t: RestaurantTable) => void;
  onShare: (t: RestaurantTable) => void;
  onWhatsApp: (t: RestaurantTable) => void;
}) {
  const cfg   = STATUS_CFG[table.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.available;
  const [imgOk, setImgOk] = useState(true);

  return (
    <TouchableOpacity style={[s.listRow, !isLast && s.listRowBorder]} onPress={() => onTap(table)} activeOpacity={0.7}>
      {/* QR thumb */}
      <View style={s.listColQr}>
        <TouchableOpacity style={s.qrThumbWrap} onPress={() => table.qr_image_url && onQr(table)}>
          {table.qr_image_url && imgOk ? (
            <Image source={{ uri: table.qr_image_url }} style={s.qrThumbImg} resizeMode="contain" onError={() => setImgOk(false)} />
          ) : (
            <Ionicons name="qr-code-outline" size={26} color="#c4b5fd" />
          )}
        </TouchableOpacity>
      </View>
      {/* Name */}
      <View style={s.listColName}>
        <Text style={s.listName}>{table.name}</Text>
        {table.table_number ? <Text style={s.listNo}>No. {table.table_number}</Text> : null}
      </View>
      <Text style={[s.listCell, s.listColFloor]}>{table.floor || '–'}</Text>
      <Text style={[s.listCell, s.listColCap, { textAlign: 'center' }]}>{table.capacity ?? '–'}</Text>
      {/* Status */}
      <View style={s.listColSt}>
        <View style={[s.badge, { backgroundColor: cfg.badge }]}>
          <Text style={[s.badgeTxt, { color: cfg.text }]}>{cfg.label}</Text>
        </View>
      </View>
      {/* Actions */}
      <View style={[s.listColAct]}>
        <TouchableOpacity style={[s.listActBtn, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]} onPress={() => onShare(table)} hitSlop={6}>
          <Ionicons name="download-outline" size={13} color="#475569" />
        </TouchableOpacity>
        <TouchableOpacity style={[s.listActBtn, { backgroundColor: '#ecfdf5', borderColor: '#d1fae5' }]} onPress={() => onWhatsApp(table)} hitSlop={6}>
          <Ionicons name="logo-whatsapp" size={13} color="#059669" />
        </TouchableOpacity>
        <TouchableOpacity style={[s.listActBtn, { backgroundColor: '#eef2ff', borderColor: '#e0e7ff' }]} onPress={() => onShare(table)} hitSlop={6}>
          <Ionicons name="mail-outline" size={13} color="#4f46e5" />
        </TouchableOpacity>
        {isSuperAdmin && (
          <>
            <TouchableOpacity style={[s.listActBtn, { backgroundColor: '#fef9c3', borderColor: '#fef3c7' }]} onPress={() => onEdit(table)} hitSlop={6}>
              <Ionicons name="pencil-outline" size={13} color="#b45309" />
            </TouchableOpacity>
            <TouchableOpacity style={[s.listActBtn, { backgroundColor: '#fef2f2', borderColor: '#fee2e2' }]} onPress={() => onDelete(table)} hitSlop={6}>
              <Ionicons name="trash-outline" size={13} color="#dc2626" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── QR Full Modal ────────────────────────────────────────────────────────────

function QrFullModal({ table, restaurantName, onClose, onShare, onWhatsApp }: {
  table: RestaurantTable; restaurantName: string;
  onClose: () => void;
  onShare: (t: RestaurantTable) => void;
  onWhatsApp: (t: RestaurantTable) => void;
}) {
  const cfg   = STATUS_CFG[table.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.available;
  const label = table.table_number ? `Table Number - ${table.table_number}` : table.name;
  const [imgOk, setImgOk]   = useState(true);
  const [loaded, setLoaded] = useState(false);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalBg} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={s.qrModalBox} activeOpacity={1} onPress={() => {}}>
          {/* Frame */}
          <View style={s.qrMFrame}>
            <View style={s.qrMInner}>
              <Text style={s.qrMTitle}>OrderByQR</Text>
              <Text style={s.qrMRestaurant}>{restaurantName}</Text>
              <Text style={s.qrMLabel}>{label}</Text>

              {/* QR */}
              <View style={s.qrMImgWrap}>
                <View style={s.qrMFrame2}>
                  <View style={s.qrMInner2}>
                    {table.qr_image_url && imgOk ? (
                      <>
                        {!loaded && <ActivityIndicator color={BRAND_PURPLE} style={StyleSheet.absoluteFill} />}
                        <Image
                          source={{ uri: table.qr_image_url }}
                          style={[s.qrMImg, !loaded && { opacity: 0 }]}
                          resizeMode="contain"
                          onLoad={() => setLoaded(true)}
                          onError={() => setImgOk(false)}
                        />
                      </>
                    ) : (
                      <Ionicons name="qr-code-outline" size={100} color="#c4b5fd" />
                    )}
                  </View>
                </View>
              </View>

              {/* Footer info */}
              <View style={s.qrMFooter}>
                <View>
                  <Text style={s.qrMFooterMeta}>Floor: {table.floor || '–'} | Capacity: {table.capacity ?? '–'}</Text>
                  <View style={[s.badge, { backgroundColor: cfg.badge, marginTop: 4 }]}>
                    <Text style={[s.badgeTxt, { color: cfg.text }]}>{cfg.label}</Text>
                  </View>
                </View>
                <Text style={s.powered}>Powered by <Text style={s.poweredBrand}>IT Softwar</Text></Text>
              </View>

              {/* Action buttons */}
              <View style={s.qrMActions}>
                <TouchableOpacity style={s.qrMBtn} onPress={() => { onClose(); onShare(table); }}>
                  <Ionicons name="download-outline" size={16} color="#475569" />
                  <Text style={s.qrMBtnTxt}>Download</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.qrMBtn, { backgroundColor: '#ecfdf5', borderColor: '#d1fae5' }]} onPress={() => { onClose(); onWhatsApp(table); }}>
                  <Ionicons name="logo-whatsapp" size={16} color="#059669" />
                  <Text style={[s.qrMBtnTxt, { color: '#059669' }]}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.qrMBtn, { backgroundColor: '#eef2ff', borderColor: '#e0e7ff' }]} onPress={() => { onClose(); onShare(table); }}>
                  <Ionicons name="mail-outline" size={16} color="#4f46e5" />
                  <Text style={[s.qrMBtnTxt, { color: '#4f46e5' }]}>Email</Text>
                </TouchableOpacity>
                {table.qr_url && (
                  <TouchableOpacity style={[s.qrMBtn, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]} onPress={() => Linking.openURL(table.qr_url!)}>
                    <Ionicons name="open-outline" size={16} color="#16a34a" />
                    <Text style={[s.qrMBtnTxt, { color: '#16a34a' }]}>Open</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Close X */}
          <TouchableOpacity style={s.qrMClose} onPress={onClose}>
            <Ionicons name="close" size={18} color="#475569" />
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Table Form Modal ─────────────────────────────────────────────────────────

function TableFormModal({ visible, isEdit, form, saving, onChange, onSave, onClose }: {
  visible: boolean; isEdit: boolean; form: typeof EMPTY_FORM; saving: boolean;
  onChange: (f: FormField, v: string) => void;
  onSave: () => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.dialogOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={s.dialog}>
          {/* Header */}
          <View style={s.dialogHead}>
            <Text style={s.dialogTitle}>{isEdit ? 'Edit Table' : 'Add Table'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={s.dialogClose}>
              <Ionicons name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView keyboardShouldPersistTaps="handled" style={s.dialogBody} showsVerticalScrollIndicator={false}>
            <FField label="Table Number" hint="Used for sorting. Optional." kbd="numeric" value={form.table_number} ph="e.g. 1, 2, 10" onCh={v => onChange('table_number', v)} />
            <FField label="Table Name *" value={form.name} ph="e.g. T1, Window Table" onCh={v => onChange('name', v)} />
            <FField label="Floor" value={form.floor} ph="e.g. 1st, 2nd" onCh={v => onChange('floor', v)} />
            <FField label="Capacity" kbd="numeric" value={form.capacity} ph="4" onCh={v => onChange('capacity', v)} />

            <Text style={s.fLabel}>Status</Text>
            <View style={s.segRow}>
              {(['available', 'occupied', 'reserved'] as const).map(st => (
                <TouchableOpacity
                  key={st}
                  style={[s.segBtn, form.status === st && {
                    backgroundColor: st === 'available' ? '#16a34a' : st === 'occupied' ? '#d97706' : '#dc2626',
                    borderColor: 'transparent',
                  }]}
                  onPress={() => onChange('status', st)}
                >
                  <Text style={[s.segTxt, form.status === st && { color: '#fff' }]}>{STATUS_CFG[st].label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Footer buttons */}
          <View style={s.dialogFoot}>
            <TouchableOpacity style={s.dialogCancel} onPress={onClose}>
              <Text style={s.dialogCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.dialogSave, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.dialogSaveTxt}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FField({ label, hint, kbd, value, ph, onCh }: {
  label: string; hint?: string; kbd?: 'default' | 'numeric'; value: string; ph?: string; onCh: (v: string) => void;
}) {
  return (
    <View style={s.fGroup}>
      <Text style={s.fLabel}>{label}</Text>
      <TextInput style={s.fInput} value={value} onChangeText={onCh} placeholder={ph} placeholderTextColor="#94a3b8" keyboardType={kbd ?? 'default'} />
      {hint ? <Text style={s.fHint}>{hint}</Text> : null}
    </View>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={s.empty}>
      <View style={s.emptyIco}><Ionicons name="grid-outline" size={36} color="#CBD5E1" /></View>
      <Text style={s.emptyTitle}>No tables found</Text>
      <Text style={s.emptyMeta}>Pull down to sync tables from server</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f5f0' },

  // ── Page header
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  pageHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pageTitle:      { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  pageRestaurant: { fontSize: 13, color: '#64748b', fontWeight: '400' },
  pageHeaderRight:{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statsPills:     { flexDirection: 'row', gap: 6 },
  pill:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pillText:       { fontSize: 11, fontWeight: '700' },
  viewToggle:     { flexDirection: 'row', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#f8fafc' },
  viewBtn:        { paddingHorizontal: 10, paddingVertical: 6 },
  viewBtnOn:      { backgroundColor: '#334155' },
  addBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnTxt:      { color: '#fff', fontWeight: '700', fontSize: 13 },

  // ── Grid
  gridPad: { padding: 12, paddingBottom: 40 },
  colWrap:  { gap: 12, marginBottom: 12 },

  // Card outer wrapper (transparent, same as CSPos)
  cardOuter: { flex: 1, backgroundColor: 'transparent', marginBottom: 0 },
  // Ghost placeholder — same flex as cardOuter but invisible, pads the last row
  cardGhost: { flex: 1, backgroundColor: 'transparent' },
  // Frame — simulates the gradient border via solid BRAND_PURPLE background + tiny padding
  cardFrame: {
    backgroundColor: FRAME_BG,
    borderRadius: 18,
    padding: 2.5,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  cardInner: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    paddingBottom: 10,
  },
  cardHead:      { alignItems: 'center', marginBottom: 8 },
  cardTitle:     { fontStyle: 'italic', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 16, fontWeight: '700', color: BRAND_PURPLE, marginBottom: 1 },
  cardRestaurant:{ fontSize: 11, fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardTableLabel:{ fontSize: 11, fontWeight: '700', color: BRAND_RED },

  // QR box inside card (with its own inner-frame)
  qrBox:   { marginBottom: 10 },
  qrFrame2:{ backgroundColor: FRAME_BG, borderRadius: 14, padding: 3 },
  qrInner2:{ backgroundColor: '#fff', borderRadius: 12, padding: 8, alignItems: 'center', justifyContent: 'center', minHeight: 140 },
  qrImg:   { width: '100%', aspectRatio: 1 },

  // Action icons row
  actionRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  iconBtn:   { width: 34, height: 34, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Card footer
  cardFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  footerLeft: { flex: 1 },
  footerMeta: { fontSize: 11, color: '#64748b', marginBottom: 4 },
  footerRight:{ alignItems: 'flex-end', gap: 4 },
  badge:      { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeTxt:   { fontSize: 10, fontWeight: '700' },
  dotMenuBtn: { padding: 2 },
  dropMenu:   { position: 'absolute', right: 0, bottom: 24, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', minWidth: 130, zIndex: 99, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 10 },
  dropItem:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  dropItemTxt:{ fontSize: 13, color: '#374151', fontWeight: '500' },
  powered:    { fontSize: 10, color: '#94a3b8' },
  poweredBrand: { fontWeight: '700', color: '#16a34a' },

  // ── List view
  listPad:     { padding: 12, paddingBottom: 40 },
  listCard:    { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  listRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  listRowBorder:{ borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  listHeaderRow:{ backgroundColor: '#f8fafc', paddingVertical: 8 },
  hdrTxt:      { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' as const },
  listCell:    { fontSize: 13, color: '#374151' },
  listColQr:   { width: 58, marginRight: 8 },
  listColName: { flex: 1, marginRight: 8 },
  listColFloor:{ width: 55, color: '#64748b' },
  listColCap:  { width: 36, color: '#64748b' },
  listColSt:   { width: 80, marginRight: 4 },
  listColAct:  { flexDirection: 'row', gap: 4, justifyContent: 'flex-end', minWidth: 140 },
  listName:    { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  listNo:      { fontSize: 11, color: '#94a3b8' },
  qrThumbWrap: { width: 50, height: 50, borderRadius: 6, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  qrThumbImg:  { width: '100%', height: '100%' },
  listActBtn:  { width: 28, height: 28, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // ── QR Fullscreen Modal
  modalBg:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  qrModalBox:{ width: 320, position: 'relative' },
  qrMFrame:  { backgroundColor: FRAME_BG, borderRadius: 22, padding: 3, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  qrMInner:  { backgroundColor: '#fff', borderRadius: 20, padding: 18, alignItems: 'center' },
  qrMTitle:  { fontStyle: 'italic', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 19, fontWeight: '700', color: BRAND_PURPLE, marginBottom: 2 },
  qrMRestaurant: { fontSize: 12, fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  qrMLabel:  { fontSize: 12, fontWeight: '700', color: BRAND_RED, marginBottom: 10 },
  qrMImgWrap:{ width: '100%', marginBottom: 12 },
  qrMFrame2: { backgroundColor: FRAME_BG, borderRadius: 14, padding: 3 },
  qrMInner2: { backgroundColor: '#fff', borderRadius: 12, padding: 8, alignItems: 'center', minHeight: 180 },
  qrMImg:    { width: 160, height: 160 },
  qrMFooter: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginBottom: 12 },
  qrMFooterMeta: { fontSize: 11, color: '#64748b' },
  qrMActions:{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 4 },
  qrMBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  qrMBtnTxt: { fontSize: 12, fontWeight: '600', color: '#475569' },
  qrMClose:  { position: 'absolute', top: -12, right: -12, width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },

  // ── Centered Dialog (Add / Edit Table)
  dialogOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 20 },
  dialog: {
    width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12,
    maxHeight: '88%',
  },
  dialogHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  dialogClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  dialogBody:  { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 4 },
  dialogFoot:  { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingVertical: 18, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  dialogCancel:    { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#d1d5db', alignItems: 'center' },
  dialogCancelTxt: { fontSize: 14, fontWeight: '600', color: '#475569' },
  dialogSave:      { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#16a34a', alignItems: 'center' },
  dialogSaveTxt:   { fontSize: 14, fontWeight: '700', color: '#fff' },
  fGroup:     { marginBottom: 18 },
  fLabel:     { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 7 },
  fInput:     { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, color: '#1e293b', backgroundColor: '#fff' },
  fHint:      { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  segRow:     { flexDirection: 'row', gap: 8, marginBottom: 8 },
  segBtn:     { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: '#d1d5db', alignItems: 'center' },
  segTxt:     { fontSize: 12, fontWeight: '700', color: '#475569' },

  // ── Empty
  empty:      { alignItems: 'center', paddingTop: 100, gap: 10 },
  emptyIco:   { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#94a3b8' },
  emptyMeta:  { fontSize: 13, color: '#cbd5e1', textAlign: 'center' },
});
