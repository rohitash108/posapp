import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  TextInput, ScrollView, Modal, Alert, ActivityIndicator, Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import uuid from 'react-native-uuid';
import Toast from 'react-native-toast-message';
import { getCategories, getItems, addToSyncQueue, createLocalOrder } from '@/database/repositories';
import { webGetCategories, webGetItems, webSaveOrder, webAddSyncQueue, webHasData, webSaveCategories, webSaveItems } from '@/utils/webDb';
import { useCartStore } from '@/store/cartStore';
import { useAppStore } from '@/store/appStore';
import { ordersApi } from '@/api/orders';
import client, { API_BASE_URL } from '@/api/client';
import type { Category, Item, Variation, RestaurantTable } from '@/types';

const SERVER_URL = API_BASE_URL.replace('/api/mobile', '');
const FOOD_COLORS: Record<string, string> = { veg: '#10b981', non_veg: '#ef4444', egg: '#f59e0b' };
const PAYMENT_METHODS = [
  { key: 'cash',  label: 'Cash',  icon: 'cash-outline' as const },
  { key: 'card',  label: 'Card',  icon: 'card-outline' as const },
  { key: 'upi',   label: 'UPI',   icon: 'qr-code-outline' as const },
];
const ORDER_TYPES = [
  { key: 'dine_in',   label: 'Dine In',   icon: 'restaurant-outline' as const },
  { key: 'takeaway',  label: 'Takeaway',  icon: 'bag-handle-outline' as const },
  { key: 'delivery',  label: 'Delivery',  icon: 'bicycle-outline' as const },
];

function itemImageUrl(img?: string) {
  if (!img) return null;
  if (img.startsWith('http')) return img;
  return `${SERVER_URL}/storage/${img}`;
}

function getDisplayPrice(item: Item): string {
  if (item.variations?.length) {
    const prices = item.variations.map(v => v.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `₹${min.toFixed(2)}` : `₹${min.toFixed(2)} – ₹${max.toFixed(2)}`;
  }
  return `₹${(item.price || 0).toFixed(2)}`;
}

export default function POSScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [activeCatId, setActiveCatId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [foodFilter, setFoodFilter] = useState<Record<string, boolean>>({ veg: true, non_veg: true, egg: true });
  const [variationItem, setVariationItem] = useState<Item | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [walkInName, setWalkInName] = useState('');

  const { cart, addItem, updateQuantity, clearCart, getSubtotal, getTotal, setOrderType, setTable, setCustomer } = useCartStore();
  const { isOnline, taxes } = useAppStore();
  const taxRate = taxes[0]?.rate ?? 0;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const cols = width >= 1400 ? 5 : width >= 1100 ? 4 : width >= 768 ? 3 : 2;

  const loadData = useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        const res = await client.get('/sync/pull');
        const cats: Category[] = res.data.categories ?? [];
        const items: Item[] = res.data.items ?? [];
        const tbls: RestaurantTable[] = res.data.tables ?? [];
        webSaveCategories(cats).catch(console.warn);
        webSaveItems(items).catch(console.warn);
        setCategories(cats);
        setAllItems(items);
        setTables(tbls);
        if (cats.length > 0) setActiveCatId(cats[0].id);
        useAppStore.getState().setTaxes(res.data.taxes ?? []);
      } catch {
        const hasData = await webHasData();
        if (hasData) {
          const cats = await webGetCategories();
          const items = await webGetItems();
          setCategories(cats);
          setAllItems(items);
          if (cats.length > 0) setActiveCatId(cats[0].id);
        } else {
          Alert.alert('Offline', 'No cached data. Connect to internet once to load menu.');
        }
      }
    } else {
      const cats = await getCategories();
      setCategories(cats);
      if (cats.length > 0) setActiveCatId(cats[0].id);
    }
  }, []);

  const loadItems = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const items = await getItems(activeCatId ?? undefined);
      setAllItems(items);
    }
  }, [activeCatId]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadItems(); }, [activeCatId]);

  const displayItems = (() => {
    let items = Platform.OS === 'web'
      ? allItems.filter(i => !activeCatId || i.category_id === activeCatId)
      : allItems;
    if (search.trim()) {
      items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    }
    items = items.filter(i => {
      const ft = i.food_type || 'veg';
      return foodFilter[ft] !== false;
    });
    return items;
  })();

  function addToCart(item: Item, variation?: Variation) {
    const price = variation ? variation.price : (item.price || 0);
    const variationName = variation ? variation.name : undefined;
    const existing = cart.items.find(i => i.item_id === item.id && i.variation === variationName);
    if (existing) {
      updateQuantity(existing.uuid, existing.quantity + 1);
    } else {
      addItem({ item_id: item.id, name: item.name, variation: variationName, addons: [], quantity: 1, unit_price: price, total_price: price });
    }
  }

  function handleAdd(item: Item) {
    if (item.variations?.length) {
      setVariationItem(item);
    } else {
      addToCart(item);
      if (!isDesktop) Toast.show({ type: 'success', text1: `${item.name} added`, visibilityTime: 600 });
    }
  }

  function getCartQty(item: Item) {
    return cart.items.filter(c => c.item_id === item.id).reduce((s, c) => s + c.quantity, 0);
  }

  async function handlePlaceOrder() {
    if (cart.items.length === 0) { Alert.alert('Cart empty', 'Add items first.'); return; }
    setPlacing(true);
    const localUuid = uuid.v4() as string;
    const subtotal = getSubtotal();
    const taxAmount = parseFloat(((subtotal * taxRate) / 100).toFixed(2));
    const total = getTotal(taxRate);
    if (walkInName) setCustomer(undefined, walkInName, undefined);
    const payload = {
      local_uuid: localUuid, order_type: cart.order_type, status: 'pending',
      payment_status: 'unpaid', payment_method: paymentMethod,
      restaurant_table_id: cart.table_id,
      customer_name: walkInName || cart.customer_name || 'Walk-in',
      customer_phone: cart.customer_phone,
      subtotal, tax_amount: taxAmount,
      discount_amount: cart.discount_amount, total, received_amount: 0, notes: cart.notes,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      items: cart.items.map(i => ({
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
      clearCart(); setWalkInName(''); setShowCart(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Unknown error');
    } finally { setPlacing(false); }
  }

  const cartCount = cart.items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = getSubtotal();
  const taxAmount = parseFloat(((subtotal * taxRate) / 100).toFixed(2));
  const total = getTotal(taxRate);

  // Variation modal
  const VariationModal = () => (
    <Modal visible={!!variationItem} transparent animationType="fade" onRequestClose={() => setVariationItem(null)}>
      <View style={st.vmOverlay}>
        <View style={st.vmSheet}>
          <View style={st.vmHeader}>
            <View style={{ flex: 1 }}>
              <Text style={st.vmTitle}>{variationItem?.name}</Text>
              <Text style={st.vmSub}>Select variation</Text>
            </View>
            <TouchableOpacity onPress={() => setVariationItem(null)} style={st.vmClose}>
              <Ionicons name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 10 }}>
            {variationItem?.variations.map((v) => (
              <TouchableOpacity key={v.id} style={st.vmRow} onPress={() => { addToCart(variationItem!, v); setVariationItem(null); }}>
                <View style={st.vmDot} />
                <Text style={st.vmName}>{v.name}</Text>
                <Text style={st.vmPrice}>₹{v.price.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // Cart panel (right side on desktop, modal on mobile)
  const CartContent = () => (
    <View style={{ flex: 1 }}>
      {/* Order type tabs */}
      <View style={st.orderTabs}>
        {ORDER_TYPES.map(t => (
          <TouchableOpacity key={t.key} style={[st.orderTab, cart.order_type === t.key && st.orderTabActive]} onPress={() => setOrderType(t.key as any)}>
            <Ionicons name={t.icon} size={13} color={cart.order_type === t.key ? '#1A2B1A' : '#6b7280'} />
            <Text style={[st.orderTabText, cart.order_type === t.key && st.orderTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Customer + Table */}
      <View style={st.customerRow}>
        <View style={st.customerField}>
          <Text style={st.fieldLabel}>Customer</Text>
          <View style={st.fieldInput}>
            <Ionicons name="person-outline" size={14} color="#9ca3af" />
            <TextInput
              style={st.fieldText}
              placeholder="Walk-in"
              value={walkInName}
              onChangeText={setWalkInName}
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>
        {cart.order_type === 'dine_in' && tables.length > 0 && (
          <View style={st.customerField}>
            <Text style={st.fieldLabel}>Table</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {tables.map(t => (
                  <TouchableOpacity key={t.id} style={[st.tableChip, cart.table_id === t.id && st.tableChipActive]} onPress={() => setTable(t.id)}>
                    <Text style={[st.tableChipText, cart.table_id === t.id && st.tableChipTextActive]}>{t.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </View>

      {/* Cart column headers */}
      <View style={st.cartCols}>
        <Text style={[st.cartColText, { flex: 1 }]}>ITEM</Text>
        <Text style={[st.cartColText, { width: 80, textAlign: 'center' }]}>QTY</Text>
        <Text style={[st.cartColText, { width: 70, textAlign: 'right' }]}>PRICE</Text>
      </View>

      {/* Cart items */}
      <ScrollView style={st.cartList} showsVerticalScrollIndicator={false}>
        {cart.items.length === 0 ? (
          <View style={st.emptyCartWrap}>
            <View style={st.emptyCartIcon}><Ionicons name="cart-outline" size={26} color="#0D76E1" /></View>
            <Text style={st.emptyCartText}>Cart is empty</Text>
            <Text style={st.emptyCartSub}>Tap items to add them here</Text>
          </View>
        ) : (
          cart.items.map(item => (
            <View key={item.uuid} style={st.cartRow}>
              <View style={{ flex: 1, marginRight: 4 }}>
                <Text style={st.cartRowName} numberOfLines={1}>{item.name}</Text>
                {item.variation && <Text style={st.cartRowVar}>{item.variation}</Text>}
              </View>
              <View style={st.qtyRow}>
                <TouchableOpacity style={st.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity - 1)}>
                  <Ionicons name="remove" size={12} color="#374151" />
                </TouchableOpacity>
                <Text style={st.qtyNum}>{item.quantity}</Text>
                <TouchableOpacity style={st.qtyBtn} onPress={() => updateQuantity(item.uuid, item.quantity + 1)}>
                  <Ionicons name="add" size={12} color="#374151" />
                </TouchableOpacity>
              </View>
              <Text style={st.cartRowPrice}>₹{item.total_price.toFixed(2)}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Summary */}
      <View style={st.summary}>
        <View style={st.sumRow}><Text style={st.sumLabel}>Subtotal</Text><Text style={st.sumVal}>₹{subtotal.toFixed(2)}</Text></View>
        {taxRate > 0 && <View style={st.sumRow}><Text style={st.sumLabel}>Tax ({taxRate}%)</Text><Text style={st.sumVal}>₹{taxAmount.toFixed(2)}</Text></View>}
        {cart.discount_amount > 0 && <View style={st.sumRow}><Text style={st.sumLabel}>Discount</Text><Text style={[st.sumVal, { color: '#10b981' }]}>-₹{cart.discount_amount.toFixed(2)}</Text></View>}
        <View style={st.totalRow}><Text style={st.totalLabel}>Total</Text><Text style={st.totalVal}>₹{total.toFixed(2)}</Text></View>
      </View>

      {/* Payment method */}
      <View style={st.payRow}>
        {PAYMENT_METHODS.map(pm => (
          <TouchableOpacity key={pm.key} style={[st.payBtn, paymentMethod === pm.key && st.payBtnActive]} onPress={() => setPaymentMethod(pm.key)}>
            <Ionicons name={pm.icon} size={15} color={paymentMethod === pm.key ? '#fff' : '#374151'} />
            <Text style={[st.payBtnText, paymentMethod === pm.key && st.payBtnTextActive]}>{pm.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Checkout buttons */}
      <View style={st.checkoutRow}>
        <TouchableOpacity style={[st.checkoutBtn, st.checkoutBtnSave, (placing || cartCount === 0) && { opacity: 0.45 }]} onPress={handlePlaceOrder} disabled={placing || cartCount === 0}>
          {placing ? <ActivityIndicator color="#fff" size="small" /> : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <View style={{ marginLeft: 6 }}>
                <Text style={st.checkoutBtnLabel}>{isOnline ? 'Place Order' : 'Save Offline'}</Text>
                {cartCount > 0 && <Text style={st.checkoutBtnTotal}>₹{total.toFixed(2)}</Text>}
              </View>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[st.checkoutBtn, st.checkoutBtnKot, (cartCount === 0) && { opacity: 0.45 }]} onPress={clearCart} disabled={cartCount === 0}>
          <Ionicons name="trash-outline" size={16} color="#fff" />
          <Text style={[st.checkoutBtnLabel, { marginLeft: 6 }]}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─── Item card ───
  const ItemCard = ({ item }: { item: Item }) => {
    const qty = getCartQty(item);
    const imgUrl = itemImageUrl(item.image);
    const ft = item.food_type;
    return (
      <TouchableOpacity style={[st.itemCard, qty > 0 && st.itemCardActive]} onPress={() => handleAdd(item)} activeOpacity={0.82}>
        {qty > 0 && (
          <View style={st.inCartBadge}><Text style={st.inCartBadgeText}>×{qty}</Text></View>
        )}
        {ft && <View style={[st.foodDot, { backgroundColor: FOOD_COLORS[ft] }]} />}
        <View style={st.itemImgWrap}>
          {imgUrl ? (
            <Image source={{ uri: imgUrl }} style={st.itemImg} resizeMode="cover" />
          ) : (
            <View style={st.itemImgPlaceholder}>
              <Ionicons name="restaurant-outline" size={22} color="#d1d5db" />
            </View>
          )}
        </View>
        <Text style={st.itemName} numberOfLines={2}>{item.name}</Text>
        <View style={st.itemBottom}>
          <Text style={st.itemPrice}>{getDisplayPrice(item)}</Text>
          {item.variations?.length ? <Text style={st.varTag}>{item.variations.length} var</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  if (isDesktop) {
    return (
      <View style={st.shell}>
        <VariationModal />

        {/* ── LEFT: Category rail ── */}
        <View style={st.rail}>
          <Text style={st.railTitle}>Categories</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={st.railScroll}>
            {[{ id: null, name: 'All Items', count: allItems.length },
              ...categories.map(c => ({ id: c.id, name: c.name, count: allItems.filter(i => i.category_id === c.id).length }))
            ].map(c => {
              const active = activeCatId === c.id;
              return (
                <TouchableOpacity key={c.id ?? 'all'} style={[st.railItem, active && st.railItemActive]} onPress={() => setActiveCatId(c.id)} activeOpacity={0.75}>
                  <Ionicons name={c.id === null ? 'grid-outline' : 'pricetag-outline'} size={13} color={active ? '#0D76E1' : '#9ca3af'} />
                  <Text style={[st.railItemText, active && st.railItemTextActive]} numberOfLines={1}>{c.name}</Text>
                  <View style={[st.railCount, active && st.railCountActive]}>
                    <Text style={[st.railCountText, active && st.railCountTextActive]}>{c.count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── CENTER: Items ── */}
        <View style={st.main}>
          {/* Search + filter chips */}
          <View style={st.topbar}>
            <View style={st.searchWrap}>
              <Ionicons name="search" size={16} color="#9ca3af" />
              <TextInput style={st.searchInput} placeholder="Search items..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
              {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#9ca3af" /></TouchableOpacity> : null}
            </View>
            <View style={st.chips}>
              {(['veg', 'non_veg', 'egg'] as const).map(ft => (
                <TouchableOpacity key={ft} style={[st.chip, foodFilter[ft] && st.chipActive]} onPress={() => setFoodFilter(p => ({ ...p, [ft]: !p[ft] }))}>
                  <View style={[st.chipDot, { backgroundColor: FOOD_COLORS[ft] }]} />
                  <Text style={[st.chipText, foodFilter[ft] && st.chipTextActive]}>{ft === 'veg' ? 'Veg' : ft === 'non_veg' ? 'Non-Veg' : 'Egg'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={st.itemCount}>{displayItems.length} items</Text>

          <FlatList
            data={displayItems}
            keyExtractor={i => String(i.id)}
            numColumns={cols} key={`grid-${cols}`}
            columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
            contentContainerStyle={{ gap: 10, paddingHorizontal: 12, paddingBottom: 20 }}
            renderItem={({ item }) => <ItemCard item={item} />}
            ListEmptyComponent={
              <View style={st.emptyGrid}>
                <Ionicons name="restaurant-outline" size={36} color="#e5e7eb" />
                <Text style={st.emptyGridText}>No items found</Text>
              </View>
            }
          />
        </View>

        {/* ── RIGHT: Cart ── */}
        <View style={st.cart}>
          <View style={st.cartHeader}>
            <Ionicons name="receipt-outline" size={16} color="#fff" />
            <Text style={st.cartHeaderTitle}>Order</Text>
            {cartCount > 0 && (
              <View style={st.cartHeaderBadge}><Text style={st.cartHeaderBadgeText}>{cartCount}</Text></View>
            )}
            {cartCount > 0 && (
              <TouchableOpacity style={st.cartClearBtn} onPress={clearCart}>
                <Ionicons name="trash-outline" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
          <CartContent />
        </View>
      </View>
    );
  }

  // ── MOBILE ──
  return (
    <View style={st.mShell}>
      <VariationModal />

      {/* Category chips row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.mCatRow} contentContainerStyle={{ paddingHorizontal: 10, gap: 6 }}>
        {[{ id: null, name: 'All' }, ...categories.map(c => ({ id: c.id, name: c.name }))].map(c => (
          <TouchableOpacity key={c.id ?? 'all'} style={[st.mCatChip, activeCatId === c.id && st.mCatChipActive]} onPress={() => setActiveCatId(c.id)}>
            <Text style={[st.mCatChipText, activeCatId === c.id && st.mCatChipTextActive]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={st.mSearchRow}>
        <Ionicons name="search" size={15} color="#9ca3af" />
        <TextInput style={st.mSearchInput} placeholder="Search..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
      </View>

      {/* Items grid */}
      <FlatList
        data={displayItems}
        keyExtractor={i => String(i.id)}
        numColumns={2} key="mobile-2"
        columnWrapperStyle={{ gap: 8, paddingHorizontal: 10 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 10, paddingBottom: 100, paddingTop: 6 }}
        renderItem={({ item }) => <ItemCard item={item} />}
      />

      {/* FAB */}
      {cartCount > 0 && (
        <TouchableOpacity style={st.mFab} onPress={() => setShowCart(true)}>
          <Ionicons name="cart" size={22} color="#fff" />
          <View style={st.mFabBadge}><Text style={st.mFabBadgeText}>{cartCount}</Text></View>
          <Text style={st.mFabTotal}>₹{total.toFixed(2)}</Text>
        </TouchableOpacity>
      )}

      {/* Cart modal */}
      <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={st.cartHeader}>
            <Ionicons name="receipt-outline" size={16} color="#fff" />
            <Text style={st.cartHeaderTitle}>Order Summary</Text>
            {cartCount > 0 && <View style={st.cartHeaderBadge}><Text style={st.cartHeaderBadgeText}>{cartCount}</Text></View>}
            <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={() => setShowCart(false)}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <CartContent />
        </View>
      </Modal>
    </View>
  );
}

const TEAL = '#0f8f73';

const st = StyleSheet.create({
  // Shell
  shell: { flex: 1, flexDirection: 'row', backgroundColor: '#f0f2f7' },

  // Category rail (white, left)
  rail: { width: 160, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#e5e7eb', flexDirection: 'column' },
  railTitle: { fontSize: 9.5, fontWeight: '700', color: '#6b7280', letterSpacing: 1.2, textTransform: 'uppercase', padding: 12, paddingBottom: 6 },
  railScroll: { flex: 1 },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 9, marginHorizontal: 6, marginBottom: 1, borderRadius: 8, backgroundColor: 'transparent' },
  railItemActive: { backgroundColor: 'rgba(13,118,225,0.09)' },
  railItemText: { flex: 1, fontSize: 12.5, fontWeight: '500', color: '#374151' },
  railItemTextActive: { color: '#0D76E1', fontWeight: '700' },
  railCount: { backgroundColor: '#f3f4f6', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  railCountActive: { backgroundColor: 'rgba(13,118,225,0.15)' },
  railCountText: { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  railCountTextActive: { color: '#0D76E1' },

  // Main center
  main: { flex: 1, flexDirection: 'column', overflow: 'hidden' },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, flexWrap: 'wrap' },
  searchWrap: { flex: 1, minWidth: 160, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  chipActive: { backgroundColor: '#f0f4ff', borderColor: '#93c5fd' },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: '500', color: '#374151' },
  chipTextActive: { color: '#1d4ed8' },
  itemCount: { fontSize: 11.5, color: '#9ca3af', fontWeight: '500', paddingHorizontal: 14, marginBottom: 4 },

  // Item card
  itemCard: { flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', padding: 8, overflow: 'hidden', position: 'relative' },
  itemCardActive: { borderColor: '#93c5fd', shadowColor: '#0D76E1', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  inCartBadge: { position: 'absolute', top: 8, left: 8, zIndex: 3, backgroundColor: '#0D76E1', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  inCartBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  foodDot: { position: 'absolute', top: 10, right: 10, zIndex: 3, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff' },
  itemImgWrap: { aspectRatio: 4 / 3, backgroundColor: '#f3f4f6', borderRadius: 7, marginBottom: 7, overflow: 'hidden' },
  itemImg: { width: '100%', height: '100%' },
  itemImgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 12.5, fontWeight: '600', color: '#111827', marginBottom: 6, lineHeight: 17 },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemPrice: { fontSize: 13.5, fontWeight: '800', color: '#0D76E1' },
  varTag: { fontSize: 9.5, color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  emptyGrid: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyGridText: { color: '#d1d5db', fontSize: 14 },

  // Cart panel
  cart: { width: 340, backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#e5e7eb', flexDirection: 'column' },
  cartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: TEAL },
  cartHeaderTitle: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },
  cartHeaderBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  cartHeaderBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cartClearBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: 'rgba(239,68,68,0.3)', alignItems: 'center', justifyContent: 'center' },

  // Order type tabs
  orderTabs: { flexDirection: 'row', backgroundColor: '#f5f6f8', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  orderTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 0 },
  orderTabActive: { backgroundColor: '#fff', borderBottomWidth: 2, borderBottomColor: '#0D76E1' },
  orderTabText: { fontSize: 11.5, fontWeight: '600', color: '#6b7280' },
  orderTabTextActive: { color: '#0D76E1' },

  // Customer + table
  customerRow: { padding: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  customerField: {},
  fieldLabel: { fontSize: 11, color: '#6b7280', fontWeight: '500', marginBottom: 4 },
  fieldInput: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#f5f6f8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  fieldText: { flex: 1, fontSize: 13.5, color: '#111827' },
  tableChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  tableChipActive: { backgroundColor: 'rgba(13,118,225,0.1)', borderColor: '#93c5fd' },
  tableChipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  tableChipTextActive: { color: '#0D76E1', fontWeight: '700' },

  // Cart list
  cartCols: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f5f6f8', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  cartColText: { fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  cartList: { flex: 1 },
  cartRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 4 },
  cartRowName: { fontSize: 12.5, fontWeight: '600', color: '#111827' },
  cartRowVar: { fontSize: 11, color: '#C9A52A', fontWeight: '500', marginTop: 1 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', width: 80, justifyContent: 'center', gap: 2 },
  qtyBtn: { width: 24, height: 24, backgroundColor: '#f3f4f6', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  qtyNum: { fontSize: 13, fontWeight: '700', color: '#111827', minWidth: 22, textAlign: 'center' },
  cartRowPrice: { fontSize: 13, fontWeight: '700', color: '#111827', width: 70, textAlign: 'right' },
  emptyCartWrap: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyCartIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(13,118,225,0.1)', alignItems: 'center', justifyContent: 'center' },
  emptyCartText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  emptyCartSub: { fontSize: 12, color: '#9ca3af' },

  // Summary
  summary: { padding: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#f5f6f8', gap: 4 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumLabel: { fontSize: 12.5, color: '#6b7280' },
  sumVal: { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 4 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: '#111827' },
  totalVal: { fontSize: 17, fontWeight: '800', color: '#0D76E1' },

  // Payment
  payRow: { flexDirection: 'row', gap: 6, padding: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  payBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  payBtnActive: { backgroundColor: '#0D76E1', borderColor: '#0D76E1' },
  payBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  payBtnTextActive: { color: '#fff' },

  // Checkout
  checkoutRow: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  checkoutBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10 },
  checkoutBtnSave: { backgroundColor: '#C9A52A', shadowColor: '#C9A52A', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  checkoutBtnKot: { backgroundColor: TEAL, maxWidth: 90 },
  checkoutBtnLabel: { fontSize: 13, fontWeight: '800', color: '#fff' },
  checkoutBtnTotal: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.85)', marginTop: 1 },

  // Variation modal
  vmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  vmSheet: { backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, maxHeight: '65%', overflow: 'hidden' },
  vmHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, backgroundColor: TEAL, gap: 10 },
  vmTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  vmSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  vmClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  vmRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  vmDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A52A' },
  vmName: { flex: 1, fontSize: 14.5, fontWeight: '600', color: '#111827' },
  vmPrice: { fontSize: 15, fontWeight: '800', color: '#0D76E1' },

  // Mobile
  mShell: { flex: 1, backgroundColor: '#f0f2f7' },
  mCatRow: { maxHeight: 44, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  mCatChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', alignSelf: 'center' },
  mCatChipActive: { backgroundColor: '#0D76E1', borderColor: '#0D76E1' },
  mCatChipText: { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  mCatChipTextActive: { color: '#fff' },
  mSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', marginHorizontal: 10, marginTop: 8, marginBottom: 2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  mSearchInput: { flex: 1, fontSize: 14, color: '#111827' },
  mFab: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: '#0D76E1', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#0D76E1', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  mFabBadge: { backgroundColor: '#ef4444', borderRadius: 999, minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  mFabBadgeText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  mFabTotal: { color: '#fff', fontWeight: '800', fontSize: 16, marginLeft: 'auto' },
});
