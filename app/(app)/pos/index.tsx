import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ScrollView, Modal, Alert, ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import uuid from 'react-native-uuid';
import Toast from 'react-native-toast-message';
import { getCategories, getItems, addToSyncQueue, createLocalOrder } from '@/database/repositories';
import { webGetCategories, webGetItems, webSaveOrder, webAddSyncQueue, webHasData, webSaveCategories, webSaveItems } from '@/utils/webDb';
import { useCartStore } from '@/store/cartStore';
import { useAppStore } from '@/store/appStore';
import { ordersApi } from '@/api/orders';
import client from '@/api/client';
import type { Category, Item, Variation } from '@/types';

const FOOD_COLORS: Record<string, string> = { veg: '#22c55e', non_veg: '#ef4444', egg: '#f59e0b' };
const FOOD_LABELS: Record<string, string> = { veg: 'VEG', non_veg: 'NON-VEG', egg: 'EGG' };

function getItemDisplayPrice(item: Item): string {
  if (item.variations && item.variations.length > 0) {
    const prices = item.variations.map(v => v.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `₹${min.toFixed(2)}` : `₹${min.toFixed(2)} - ₹${max.toFixed(2)}`;
  }
  return `₹${(item.price || 0).toFixed(2)}`;
}

function hasVariations(item: Item): boolean {
  return item.variations && item.variations.length > 0;
}

export default function POSScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [variationItem, setVariationItem] = useState<Item | null>(null);
  const { cart, addItem, updateQuantity, clearCart, getSubtotal, getTotal } = useCartStore();
  const { isOnline, taxes } = useAppStore();
  const defaultTaxRate = taxes[0]?.rate ?? 0;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const cols = width >= 1200 ? 4 : width >= 900 ? 3 : 2;

  const loadData = useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        const res = await client.get('/sync/pull');
        const cats: Category[] = res.data.categories ?? [];
        const items: Item[] = res.data.items ?? [];
        webSaveCategories(cats).catch(console.warn);
        webSaveItems(items).catch(console.warn);
        setCategories(cats);
        setAllItems(items);
        if (cats.length > 0) setActiveCategoryId(cats[0].id);
        useAppStore.getState().setTaxes(res.data.taxes ?? []);
      } catch {
        const hasData = await webHasData();
        if (hasData) {
          const cats = await webGetCategories();
          const items = await webGetItems();
          setCategories(cats);
          setAllItems(items);
          if (cats.length > 0) setActiveCategoryId(cats[0].id);
        } else {
          Alert.alert('Offline', 'No cached data. Please connect to internet once to load the menu.');
        }
      }
    } else {
      const cats = await getCategories();
      setCategories(cats);
      if (cats.length > 0) setActiveCategoryId(cats[0].id);
    }
  }, []);

  const loadItems = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const items = await getItems(activeCategoryId ?? undefined);
      setAllItems(items);
    }
  }, [activeCategoryId]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadItems(); }, [activeCategoryId]);

  const displayItems = Platform.OS === 'web'
    ? allItems.filter(i =>
        (!activeCategoryId || i.category_id === activeCategoryId) &&
        (!search.trim() || i.name.toLowerCase().includes(search.toLowerCase()))
      )
    : search.trim()
      ? allItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
      : allItems;

  function addToCart(item: Item, variation?: Variation) {
    const price = variation ? variation.price : (item.price || 0);
    const variationName = variation ? variation.name : undefined;
    const existing = cart.items.find(i =>
      i.item_id === item.id && i.variation === variationName
    );
    if (existing) {
      updateQuantity(existing.uuid, existing.quantity + 1);
    } else {
      addItem({
        item_id: item.id,
        name: item.name,
        variation: variationName,
        addons: [],
        quantity: 1,
        unit_price: price,
        total_price: price,
      });
    }
    if (!isDesktop) Toast.show({ type: 'success', text1: `${item.name}${variationName ? ` (${variationName})` : ''} added`, visibilityTime: 700 });
  }

  function handleAdd(item: Item) {
    if (hasVariations(item)) {
      setVariationItem(item);
    } else {
      addToCart(item);
    }
  }

  async function handlePlaceOrder() {
    if (cart.items.length === 0) { Alert.alert('Cart empty', 'Add items first.'); return; }
    setPlacing(true);
    const localUuid = uuid.v4() as string;
    const subtotal = getSubtotal();
    const taxAmount = parseFloat(((subtotal * defaultTaxRate) / 100).toFixed(2));
    const total = getTotal(defaultTaxRate);
    const payload = {
      local_uuid: localUuid, order_type: cart.order_type, status: 'pending',
      payment_status: 'unpaid', restaurant_table_id: cart.table_id,
      customer_id: cart.customer_id, customer_name: cart.customer_name,
      customer_phone: cart.customer_phone, subtotal, tax_amount: taxAmount,
      discount_amount: cart.discount_amount, total, received_amount: 0, notes: cart.notes,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      items: cart.items.map((i) => ({
        item_id: i.item_id, name: i.name, variation: i.variation,
        addons: i.addons, quantity: i.quantity, unit_price: i.unit_price, total_price: i.total_price,
      })),
    };
    try {
      let savedOffline = false;
      if (isOnline) {
        try {
          await ordersApi.create(payload);
          Toast.show({ type: 'success', text1: 'Order placed!', text2: 'Synced to server.' });
        } catch (apiErr: any) {
          if (!apiErr?.response) { savedOffline = true; }
          else {
            Alert.alert('Order Failed', apiErr?.response?.data?.message ?? `Server error ${apiErr?.response?.status}`);
            setPlacing(false); return;
          }
        }
      } else { savedOffline = true; }
      if (savedOffline) {
        if (Platform.OS === 'web') {
          await webSaveOrder({ ...payload, local_uuid: localUuid });
          await webAddSyncQueue({ id: localUuid, action: 'create_order', payload: JSON.stringify(payload), created_at: new Date().toISOString() });
        } else {
          await createLocalOrder({ ...payload, items: payload.items as any } as any);
          await addToSyncQueue({ id: localUuid, action: 'create_order', payload: JSON.stringify(payload), created_at: new Date().toISOString() });
        }
        Toast.show({ type: 'info', text1: 'Saved offline', text2: 'Will sync when online.' });
      }
      clearCart(); setShowCart(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Unknown error');
    } finally { setPlacing(false); }
  }

  const cartCount = cart.items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = getSubtotal();
  const taxAmount = parseFloat(((subtotal * defaultTaxRate) / 100).toFixed(2));
  const total = getTotal(defaultTaxRate);

  // Variation selection modal
  const VariationModal = () => (
    <Modal visible={!!variationItem} transparent animationType="fade" onRequestClose={() => setVariationItem(null)}>
      <View style={vm.overlay}>
        <View style={vm.sheet}>
          <View style={vm.sheetHeader}>
            <View>
              <Text style={vm.sheetTitle}>{variationItem?.name}</Text>
              <Text style={vm.sheetSub}>Select a variation</Text>
            </View>
            <TouchableOpacity onPress={() => setVariationItem(null)} style={vm.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
          <ScrollView style={vm.varList}>
            {variationItem?.variations.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={vm.varRow}
                onPress={() => { addToCart(variationItem!, v); setVariationItem(null); }}
              >
                <View style={vm.varLeft}>
                  <View style={vm.varDot} />
                  <Text style={vm.varName}>{v.name}</Text>
                </View>
                <Text style={vm.varPrice}>₹{v.price.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const CartPanel = () => (
    <View style={ds.cartPanel}>
      <View style={ds.cartHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="cart-outline" size={18} color="#C9A52A" />
          <Text style={ds.cartTitle}>Current Order</Text>
          {cartCount > 0 && (
            <View style={{ backgroundColor: '#C9A52A', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ color: '#1A2B1A', fontWeight: '800', fontSize: 11 }}>{cartCount}</Text>
            </View>
          )}
        </View>
        {cartCount > 0 && (
          <TouchableOpacity onPress={clearCart}>
            <Text style={ds.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={ds.cartItems} showsVerticalScrollIndicator={false}>
        {cart.items.length === 0 ? (
          <View style={ds.emptyCart}>
            <Ionicons name="cart-outline" size={48} color="#E2E8F0" />
            <Text style={ds.emptyCartText}>No items added</Text>
            <Text style={ds.emptyCartSub}>Tap items to add to order</Text>
          </View>
        ) : (
          cart.items.map((item) => (
            <View key={item.uuid} style={ds.cartItem}>
              <View style={ds.cartItemInfo}>
                <Text style={ds.cartItemName} numberOfLines={1}>{item.name}</Text>
                {item.variation && (
                  <Text style={ds.cartVariation}>{item.variation}</Text>
                )}
                <Text style={ds.cartItemPrice}>₹{item.unit_price.toFixed(2)} each</Text>
              </View>
              <View style={ds.qtyControl}>
                <TouchableOpacity style={ds.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity - 1)}>
                  <Ionicons name="remove" size={14} color="#1A2B1A" />
                </TouchableOpacity>
                <Text style={ds.qtyText}>{item.quantity}</Text>
                <TouchableOpacity style={ds.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity + 1)}>
                  <Ionicons name="add" size={14} color="#1A2B1A" />
                </TouchableOpacity>
              </View>
              <Text style={ds.cartItemTotal}>₹{item.total_price.toFixed(2)}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <View style={ds.cartFooter}>
        <View style={ds.summaryRow}><Text style={ds.summaryLabel}>Subtotal</Text><Text style={ds.summaryVal}>₹{subtotal.toFixed(2)}</Text></View>
        {defaultTaxRate > 0 && (
          <View style={ds.summaryRow}><Text style={ds.summaryLabel}>Tax ({defaultTaxRate}%)</Text><Text style={ds.summaryVal}>₹{taxAmount.toFixed(2)}</Text></View>
        )}
        <View style={ds.totalRow}><Text style={ds.totalLabel}>Total</Text><Text style={ds.totalVal}>₹{total.toFixed(2)}</Text></View>
        <TouchableOpacity
          style={[ds.placeBtn, (placing || cartCount === 0) && { opacity: 0.5 }]}
          onPress={handlePlaceOrder} disabled={placing || cartCount === 0}
        >
          {placing ? <ActivityIndicator color="#1A2B1A" size="small" /> : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={20} color="#1A2B1A" />
              <Text style={ds.placeBtnText}>{isOnline ? 'Place Order' : 'Save Offline'}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isDesktop) {
    return (
      <View style={ds.container}>
        <VariationModal />

        {/* Categories sidebar */}
        <View style={ds.catSidebar}>
          <Text style={ds.catSidebarTitle}>CATEGORIES</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {[{ id: null, name: 'All Items', icon: 'grid-outline' as const }, ...categories.map(c => ({ id: c.id, name: c.name, icon: 'restaurant-outline' as const }))].map((c) => {
              const active = activeCategoryId === c.id;
              return (
                <TouchableOpacity
                  key={c.id ?? 'all'}
                  style={[ds.catSidebarItem, active && ds.catSidebarItemActive]}
                  onPress={() => setActiveCategoryId(c.id)}
                  activeOpacity={0.75}
                >
                  {active && <View style={ds.catActiveBar} />}
                  <View style={[ds.catIconBox, active && ds.catIconBoxActive]}>
                    <Ionicons name={c.icon} size={15} color={active ? '#C9A52A' : '#4A6A4A'} />
                  </View>
                  <Text style={[ds.catSidebarText, active && ds.catSidebarTextActive]} numberOfLines={1}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Items grid */}
        <View style={ds.itemsArea}>
          <View style={ds.searchBar}>
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput style={ds.searchInput} placeholder="Search items..." value={search} onChangeText={setSearch} placeholderTextColor="#94A3B8" />
            {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color="#94A3B8" /></TouchableOpacity> : null}
          </View>
          <Text style={ds.itemCount}>{displayItems.length} items</Text>
          <FlatList
            data={displayItems} keyExtractor={(i) => String(i.id)}
            numColumns={cols} key={cols}
            columnWrapperStyle={ds.itemRow}
            contentContainerStyle={ds.itemGrid}
            renderItem={({ item }) => {
              const inCart = cart.items.find(c => c.item_id === item.id);
              const isVariation = hasVariations(item);
              return (
                <TouchableOpacity style={[ds.itemCard, inCart && ds.itemCardActive]} onPress={() => handleAdd(item)}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                    {item.food_type ? (
                      <View style={[ds.foodBadge, { backgroundColor: FOOD_COLORS[item.food_type] + '20' }]}>
                        <View style={[ds.foodDot, { backgroundColor: FOOD_COLORS[item.food_type] }]} />
                        <Text style={[ds.foodLabel, { color: FOOD_COLORS[item.food_type] }]}>{FOOD_LABELS[item.food_type]}</Text>
                      </View>
                    ) : <View />}
                    {isVariation && (
                      <View style={ds.varBadge}>
                        <Text style={ds.varBadgeText}>{item.variations.length} var</Text>
                      </View>
                    )}
                  </View>
                  <Text style={ds.itemName} numberOfLines={2}>{item.name}</Text>
                  <View style={ds.itemBottom}>
                    <View>
                      <Text style={ds.itemPrice}>{getItemDisplayPrice(item)}</Text>
                      {isVariation && <Text style={ds.tapToSelect}>Tap to select</Text>}
                    </View>
                    {inCart && (
                      <View style={ds.inCartBadge}>
                        <Text style={ds.inCartText}>{cart.items.filter(c => c.item_id === item.id).reduce((s, c) => s + c.quantity, 0)}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={ds.empty}>
                <Ionicons name="restaurant-outline" size={48} color="#E2E8F0" />
                <Text style={ds.emptyText}>No items found</Text>
              </View>
            }
          />
        </View>

        {/* Cart panel */}
        <CartPanel />
      </View>
    );
  }

  // Mobile layout
  return (
    <View style={ms.container}>
      <VariationModal />
      <View style={ms.searchRow}>
        <Ionicons name="search" size={16} color="#aaa" style={{ marginRight: 8 }} />
        <TextInput style={ms.searchInput} placeholder="Search items..." value={search} onChangeText={setSearch} placeholderTextColor="#aaa" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ms.catRow}>
        {categories.map((c) => (
          <TouchableOpacity key={c.id} style={[ms.catTab, activeCategoryId === c.id && ms.catTabActive]} onPress={() => setActiveCategoryId(c.id)}>
            <Text style={[ms.catTabText, activeCategoryId === c.id && ms.catTabTextActive]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <FlatList
        data={displayItems} keyExtractor={(i) => String(i.id)} numColumns={2} key="mobile-2"
        columnWrapperStyle={ms.row} contentContainerStyle={ms.grid}
        renderItem={({ item }) => (
          <TouchableOpacity style={ms.itemCard} onPress={() => handleAdd(item)}>
            {item.food_type && <View style={[ms.dot, { backgroundColor: FOOD_COLORS[item.food_type] }]} />}
            <Text style={ms.itemName} numberOfLines={2}>{item.name}</Text>
            <Text style={ms.itemPrice}>{getItemDisplayPrice(item)}</Text>
            {hasVariations(item) && <Text style={ms.varHint}>Tap to select</Text>}
          </TouchableOpacity>
        )}
      />
      {cartCount > 0 && (
        <TouchableOpacity style={ms.fab} onPress={() => setShowCart(true)}>
          <Ionicons name="cart" size={22} color="#C9A52A" />
          <View style={ms.badge}><Text style={ms.badgeText}>{cartCount}</Text></View>
          <Text style={ms.fabTotal}>₹{total.toFixed(2)}</Text>
        </TouchableOpacity>
      )}
      <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet">
        <View style={ms.modal}>
          <View style={ms.modalHead}>
            <Text style={ms.modalTitle}>Order Summary</Text>
            <TouchableOpacity onPress={() => setShowCart(false)}><Ionicons name="close" size={26} color="#1a1a1a" /></TouchableOpacity>
          </View>
          <FlatList data={cart.items} keyExtractor={(i) => i.uuid} contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <View style={ms.cartItem}>
                <View style={{ flex: 1 }}>
                  <Text style={ms.cartName}>{item.name}</Text>
                  {item.variation && <Text style={ms.cartVariation}>{item.variation}</Text>}
                  <Text style={ms.cartUnit}>₹{item.unit_price.toFixed(2)} each</Text>
                </View>
                <View style={ms.qtyRow}>
                  <TouchableOpacity style={ms.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity - 1)}><Text style={ms.qtyBtnText}>−</Text></TouchableOpacity>
                  <Text style={ms.qtyNum}>{item.quantity}</Text>
                  <TouchableOpacity style={ms.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity + 1)}><Text style={ms.qtyBtnText}>+</Text></TouchableOpacity>
                </View>
                <Text style={ms.cartTotal}>₹{item.total_price.toFixed(2)}</Text>
              </View>
            )}
          />
          <View style={ms.summary}>
            <View style={ms.sumRow}><Text style={ms.sumLabel}>Subtotal</Text><Text style={ms.sumVal}>₹{subtotal.toFixed(2)}</Text></View>
            {defaultTaxRate > 0 && <View style={ms.sumRow}><Text style={ms.sumLabel}>Tax ({defaultTaxRate}%)</Text><Text style={ms.sumVal}>₹{taxAmount.toFixed(2)}</Text></View>}
            <View style={[ms.sumRow, ms.totalRow]}><Text style={ms.totalLabel}>Total</Text><Text style={ms.totalVal}>₹{total.toFixed(2)}</Text></View>
          </View>
          <TouchableOpacity style={[ms.placeBtn, placing && { opacity: 0.6 }]} onPress={handlePlaceOrder} disabled={placing}>
            {placing ? <ActivityIndicator color="#C9A52A" /> : <Text style={ms.placeBtnText}>{isOnline ? 'Place Order' : 'Save Offline'}</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// Variation modal styles
const vm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, maxHeight: '70%', overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, backgroundColor: '#1A2B1A' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  sheetSub: { fontSize: 12, color: '#4A6A4A', marginTop: 3 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  varList: { padding: 12 },
  varRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0' },
  varLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  varDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#C9A52A' },
  varName: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  varPrice: { fontSize: 17, fontWeight: '800', color: '#C9A52A' },
});

// Desktop styles
const ds = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#F4F6F4' },
  catSidebar: { width: 200, backgroundColor: '#1A2B1A', paddingTop: 12, overflow: 'hidden' },
  catSidebarTitle: { color: '#2D4A2D', fontSize: 9, fontWeight: '700', letterSpacing: 2, paddingHorizontal: 16, marginBottom: 8, marginTop: 4 },
  catSidebarItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, marginHorizontal: 8, borderRadius: 10, marginBottom: 2, gap: 10, position: 'relative', overflow: 'hidden' },
  catSidebarItemActive: { backgroundColor: 'rgba(201,165,42,0.1)' },
  catActiveBar: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, backgroundColor: '#C9A52A', borderRadius: 2 },
  catIconBox: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  catIconBoxActive: { backgroundColor: 'rgba(201,165,42,0.15)' },
  catSidebarText: { color: '#4A6A4A', fontSize: 13, fontWeight: '500', flex: 1 },
  catSidebarTextActive: { color: '#fff', fontWeight: '700' },
  itemsArea: { flex: 1, display: 'flex', flexDirection: 'column' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 14, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1.5, borderColor: '#E2E8F0', gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  searchInput: { flex: 1, fontSize: 15, color: '#0F172A' },
  itemCount: { color: '#94A3B8', fontSize: 12, paddingHorizontal: 16, marginBottom: 6, fontWeight: '500' },
  itemRow: { paddingHorizontal: 12, gap: 10 },
  itemGrid: { paddingBottom: 24, gap: 10, paddingHorizontal: 12 },
  itemCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#E2E8F0', minHeight: 120, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  itemCardActive: { borderColor: '#C9A52A', backgroundColor: '#FFFDF5', shadowColor: '#C9A52A', shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  foodBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  foodDot: { width: 6, height: 6, borderRadius: 3 },
  foodLabel: { fontSize: 9, fontWeight: '700' },
  varBadge: { backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  varBadgeText: { fontSize: 9, fontWeight: '700', color: '#3B82F6' },
  itemName: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 10, lineHeight: 20 },
  itemBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  itemPrice: { fontSize: 15, fontWeight: '800', color: '#C9A52A' },
  tapToSelect: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  inCartBadge: { backgroundColor: '#1A2B1A', borderRadius: 12, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  inCartText: { color: '#C9A52A', fontSize: 12, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { color: '#CBD5E1', fontSize: 16, marginTop: 12 },
  cartPanel: { width: 310, backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#E2E8F0', display: 'flex', flexDirection: 'column', shadowColor: '#1A2B1A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: -2, height: 0 }, elevation: 4 },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#1A2B1A' },
  cartTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  clearText: { color: '#C9A52A', fontSize: 13, fontWeight: '600' },
  cartItems: { flex: 1, padding: 12 },
  emptyCart: { alignItems: 'center', paddingTop: 56, gap: 10 },
  emptyCartText: { color: '#CBD5E1', fontSize: 15, fontWeight: '600' },
  emptyCartSub: { color: '#CBD5E1', fontSize: 12 },
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 8 },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  cartVariation: { fontSize: 11, color: '#C9A52A', fontWeight: '600', marginTop: 1 },
  cartItemPrice: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  qtyBtn: { width: 28, height: 28, backgroundColor: '#F8FAFC', borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  qtyText: { fontSize: 14, fontWeight: '700', color: '#0F172A', minWidth: 22, textAlign: 'center' },
  cartItemTotal: { fontSize: 14, fontWeight: '700', color: '#0F172A', minWidth: 60, textAlign: 'right' },
  cartFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', backgroundColor: '#FAFBFC' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  summaryLabel: { fontSize: 13, color: '#64748B' },
  summaryVal: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 14, borderTopWidth: 1.5, borderTopColor: '#E2E8F0' },
  totalLabel: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  totalVal: { fontSize: 20, fontWeight: '800', color: '#C9A52A' },
  placeBtn: { backgroundColor: '#C9A52A', borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: '#C9A52A', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  placeBtnText: { color: '#1A2B1A', fontSize: 15, fontWeight: '800' },
});

// Mobile styles
const ms = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 10, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#eee' },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#1a1a1a' },
  catRow: { maxHeight: 44, paddingHorizontal: 8 },
  catTab: { paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 4, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },
  catTabActive: { backgroundColor: '#1A2B1A', borderColor: '#1A2B1A' },
  catTabText: { fontSize: 13, fontWeight: '600', color: '#555' },
  catTabTextActive: { color: '#fff' },
  row: { justifyContent: 'space-between', paddingHorizontal: 10 },
  grid: { paddingTop: 10, paddingBottom: 100 },
  itemCard: { flex: 1, margin: 4, backgroundColor: '#fff', borderRadius: 12, padding: 12, minHeight: 90, elevation: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', marginBottom: 6 },
  itemPrice: { fontSize: 15, fontWeight: '700', color: '#C9A52A' },
  varHint: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  fab: { position: 'absolute', bottom: 16, right: 16, left: 16, backgroundColor: '#1A2B1A', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', elevation: 8 },
  badge: { backgroundColor: '#C9A52A', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
  badgeText: { color: '#1A2B1A', fontWeight: '800', fontSize: 13 },
  fabTotal: { color: '#C9A52A', fontWeight: '700', fontSize: 16, marginLeft: 12 },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  cartName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  cartVariation: { fontSize: 12, color: '#C9A52A', fontWeight: '600', marginTop: 1 },
  cartUnit: { fontSize: 13, color: '#888', marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 18, color: '#1a1a1a' },
  qtyNum: { fontSize: 16, fontWeight: '700', marginHorizontal: 10, minWidth: 20, textAlign: 'center' },
  cartTotal: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', minWidth: 70, textAlign: 'right' },
  summary: { padding: 20, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sumLabel: { fontSize: 15, color: '#555' },
  sumVal: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  totalRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee' },
  totalLabel: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  totalVal: { fontSize: 18, fontWeight: '700', color: '#C9A52A' },
  placeBtn: { margin: 16, backgroundColor: '#1A2B1A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  placeBtnText: { color: '#C9A52A', fontSize: 17, fontWeight: '800' },
});
