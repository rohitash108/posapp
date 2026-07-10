import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Switch, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { inventoryApi } from '@/api/inventory';
import { useTheme } from '@/store/themeStore';
import type { ThemeColors } from '@/theme/tokens';
import type { Ingredient } from '@/types';
import { STOCK_BRAND } from '@/components/stock/stockUi';

function mkM(c: ThemeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    box: { backgroundColor: c.surface, borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90%', overflow: 'hidden' },
    hdr: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: c.border },
    hdrTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: c.heading },
    body: { padding: 16, gap: 12 },
    field: { gap: 6 },
    label: { fontSize: 12, fontWeight: '700', color: c.text, textTransform: 'uppercase' },
    input: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.heading },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    err: { color: '#dc2626', fontSize: 12, fontWeight: '600' },
    footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: c.border },
    cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border },
    saveBtn: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: STOCK_BRAND },
    saveTxt: { color: '#fff', fontWeight: '800' },
  });
}

export default function IngredientFormModal({
  visible, ingredient, onSave, onClose,
}: {
  visible: boolean;
  ingredient: Ingredient | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const m = useMemo(() => mkM(c), [c]);
  const isEdit = !!ingredient;

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('kg');
  const [threshold, setThreshold] = useState('0');
  const [reorder, setReorder] = useState('0');
  const [trackExpiry, setTrackExpiry] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(ingredient?.name ?? '');
    setSku(ingredient?.sku ?? '');
    setUnit(ingredient?.unit ?? 'kg');
    setThreshold(String(ingredient?.low_stock_threshold ?? 0));
    setReorder(String(ingredient?.reorder_point ?? 0));
    setTrackExpiry(!!ingredient?.track_expiry);
    setIsActive(ingredient?.is_active !== false);
    setNotes(ingredient?.notes ?? '');
    setError('');
  }, [visible, ingredient]);

  async function save() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!unit.trim()) { setError('Unit is required'); return; }
    setSaving(true); setError('');
    const payload = {
      name: name.trim(),
      sku: sku.trim() || undefined,
      unit: unit.trim(),
      low_stock_threshold: parseFloat(threshold) || 0,
      reorder_point: parseFloat(reorder) || 0,
      track_expiry: trackExpiry,
      is_active: isActive,
      notes: notes.trim() || undefined,
    };
    try {
      if (isEdit && ingredient) {
        await inventoryApi.updateIngredient(ingredient.id, payload);
      } else {
        await inventoryApi.createIngredient(payload);
      }
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={m.box}>
          <View style={m.hdr}>
            <Text style={m.hdrTitle}>{isEdit ? 'Edit ingredient' : 'Add ingredient'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={c.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={m.body}>
            <View style={m.field}>
              <Text style={m.label}>Name *</Text>
              <TextInput style={m.input} value={name} onChangeText={setName} placeholderTextColor={c.textMuted} />
            </View>
            <View style={m.field}>
              <Text style={m.label}>SKU</Text>
              <TextInput style={m.input} value={sku} onChangeText={setSku} placeholderTextColor={c.textMuted} />
            </View>
            <View style={m.field}>
              <Text style={m.label}>Unit *</Text>
              <TextInput style={m.input} value={unit} onChangeText={setUnit} placeholder="kg" placeholderTextColor={c.textMuted} />
            </View>
            <View style={m.field}>
              <Text style={m.label}>Low stock threshold</Text>
              <TextInput style={m.input} value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholderTextColor={c.textMuted} />
            </View>
            <View style={m.field}>
              <Text style={m.label}>Reorder point</Text>
              <TextInput style={m.input} value={reorder} onChangeText={setReorder} keyboardType="decimal-pad" placeholderTextColor={c.textMuted} />
            </View>
            <View style={m.switchRow}>
              <Text style={m.label}>Track expiry</Text>
              <Switch value={trackExpiry} onValueChange={setTrackExpiry} trackColor={{ true: STOCK_BRAND }} />
            </View>
            {isEdit && (
              <View style={m.switchRow}>
                <Text style={m.label}>Active</Text>
                <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: STOCK_BRAND }} />
              </View>
            )}
            <View style={m.field}>
              <Text style={m.label}>Notes</Text>
              <TextInput style={[m.input, { height: 70, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={c.textMuted} />
            </View>
            {error ? <Text style={m.err}>{error}</Text> : null}
          </ScrollView>
          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}><Text style={{ color: c.text, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={m.saveBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={m.saveTxt}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
