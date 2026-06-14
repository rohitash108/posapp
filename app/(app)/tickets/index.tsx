/**
 * Tickets — Support Ticket Management
 * Restaurant Admin can: View · Create · Edit · Reply · Update Status · Close · Delete
 * Desktop: side-by-side list + detail panel
 * Mobile: list + modal detail sheet
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ScrollView,
  TextInput, Modal, ActivityIndicator, RefreshControl, Alert, Platform,
  useWindowDimensions, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, formatDistanceToNow } from 'date-fns';
import { ticketsApi } from '@/api/tickets';
import { useAppStore } from '@/store/appStore';
import type { Ticket, TicketReply, TicketStatus, TicketPriority } from '@/types';
import { useThemedScreen } from '@/theme/useThemedScreen';

// ── Config ─────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<TicketStatus, { color: string; bg: string; label: string; icon: any }> = {
  open:        { color: '#2563eb', bg: '#eff6ff', label: 'Open',        icon: 'radio-button-on-outline'   },
  in_progress: { color: '#d97706', bg: '#fef9ec', label: 'In Progress', icon: 'sync-outline'               },
  resolved:    { color: '#16a34a', bg: '#f0fdf4', label: 'Resolved',    icon: 'checkmark-circle-outline'   },
  closed:      { color: '#6b7280', bg: '#f3f4f6', label: 'Closed',      icon: 'lock-closed-outline'        },
};

const PRIORITY_CFG: Record<TicketPriority, { color: string; label: string; icon: any }> = {
  low:    { color: '#6b7280', label: 'Low',    icon: 'arrow-down-outline'   },
  medium: { color: '#2563eb', label: 'Medium', icon: 'remove-outline'       },
  high:   { color: '#d97706', label: 'High',   icon: 'arrow-up-outline'     },
  urgent: { color: '#dc2626', label: 'Urgent', icon: 'alert-circle-outline' },
};

const CATEGORIES = [
  { key: 'general',         label: 'General'         },
  { key: 'billing',         label: 'Billing'         },
  { key: 'technical',       label: 'Technical'       },
  { key: 'feature_request', label: 'Feature Request' },
];

const STATUS_FILTERS: Array<TicketStatus | 'all'> = ['all', 'open', 'in_progress', 'resolved', 'closed'];

// Next status options for each current status (what admin can change TO)
const NEXT_STATUSES: Record<TicketStatus, TicketStatus[]> = {
  open:        ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved:    ['open', 'closed'],
  closed:      ['open'],
};

function fmtDate(s?: string) {
  if (!s) return '—';
  try { return format(new Date(s), 'dd MMM yyyy, hh:mm a'); }
  catch { return s; }
}
function fmtAgo(s?: string) {
  if (!s) return '';
  try { return formatDistanceToNow(new Date(s), { addSuffix: true }); }
  catch { return ''; }
}

// ── TicketCard ─────────────────────────────────────────────────────────────────
function TicketCard({
  ticket, selected, onPress,
}: { ticket: Ticket; selected: boolean; onPress: () => void }) {
  const sc = STATUS_CFG[ticket.status] ?? STATUS_CFG.open;
  const pc = PRIORITY_CFG[ticket.priority as TicketPriority] ?? PRIORITY_CFG.medium;
  return (
    <Pressable
      style={({ pressed }) => [tc.row, selected && tc.rowSelected, { borderLeftColor: sc.color }, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <View style={tc.topRow}>
          <Text style={tc.subject} numberOfLines={1}>{ticket.subject}</Text>
          <View style={[tc.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[tc.statusText, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>
        <Text style={tc.desc} numberOfLines={2}>{ticket.description}</Text>
        <View style={tc.metaRow}>
          {ticket.ticket_number && (
            <Text style={tc.ticketNum}>#{ticket.ticket_number}</Text>
          )}
          <View style={[tc.priorityDot, { backgroundColor: pc.color }]} />
          <Text style={[tc.priorityLabel, { color: pc.color }]}>{pc.label}</Text>
          {ticket.category ? (
            <Text style={tc.category}>
              · {CATEGORIES.find(c => c.key === ticket.category)?.label ?? ticket.category}
            </Text>
          ) : null}
          {ticket.replies_count != null && ticket.replies_count > 0 && (
            <View style={tc.replyCount}>
              <Ionicons name="chatbubble-outline" size={10} color="#6b7280" />
              <Text style={tc.replyCountText}>{ticket.replies_count}</Text>
            </View>
          )}
        </View>
        <Text style={tc.date}>{fmtAgo(ticket.created_at)}</Text>
      </View>
    </Pressable>
  );
}

// ── Reply bubble ───────────────────────────────────────────────────────────────
function ReplyBubble({ reply }: { reply: TicketReply }) {
  const isStaff = !!reply.is_staff;
  return (
    <View style={[rb.wrap, isStaff ? rb.wrapStaff : rb.wrapUser]}>
      <View style={[rb.avatar, isStaff ? rb.avatarStaff : rb.avatarUser]}>
        <Ionicons
          name={isStaff ? 'headset-outline' : 'person-outline'}
          size={14} color="#fff"
        />
      </View>
      <View style={[rb.bubble, isStaff ? rb.bubbleStaff : rb.bubbleUser]}>
        <View style={rb.bubbleHeader}>
          <Text style={rb.bubbleName}>{reply.user_name ?? (isStaff ? 'Support' : 'You')}</Text>
          <Text style={rb.bubbleTime}>{fmtAgo(reply.created_at)}</Text>
        </View>
        <Text style={rb.bubbleMsg}>{reply.message}</Text>
      </View>
    </View>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────────
function TicketDetail({
  ticket,
  onClose,
  onUpdated,
  onDeleted,
}: {
  ticket: Ticket;
  onClose?: () => void;
  onUpdated: (t: Ticket) => void;
  onDeleted: (id: number) => void;
}) {
  const t = useThemedScreen();
  const { user } = useAppStore();
  const [detail, setDetail]     = useState<Ticket>(ticket);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({
    subject:     ticket.subject,
    description: ticket.description,
    priority:    ticket.priority,
    category:    ticket.category ?? 'general',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Reload full ticket (with replies) whenever the ticket id changes
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ticketsApi.show(ticket.id);
      const data: Ticket = res.data?.data ?? res.data;
      setDetail(data);
      onUpdated(data);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, [ticket.id]);

  useEffect(() => { reload(); }, [ticket.id]);

  async function sendReply() {
    const msg = replyText.trim();
    if (!msg) return;
    setSending(true);
    try {
      await ticketsApi.reply(ticket.id, msg);
      setReplyText('');
      await reload();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not send reply.');
    } finally { setSending(false); }
  }

  async function changeStatus(status: TicketStatus) {
    setShowStatusMenu(false);
    try {
      await ticketsApi.updateStatus(ticket.id, status);
      await reload();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not update status.');
    }
  }

  async function saveEdit() {
    if (detail.status === 'closed') {
      Alert.alert('Ticket Closed', 'This ticket has been closed and can no longer be updated.');
      setEditing(false);
      return;
    }
    if (!editForm.subject.trim()) { Alert.alert('Subject required'); return; }
    if (!editForm.description.trim()) { Alert.alert('Description required'); return; }
    setEditSaving(true);
    try {
      await ticketsApi.update(ticket.id, editForm);
      setEditing(false);
      await reload();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not update ticket.');
    } finally { setEditSaving(false); }
  }

  function confirmDelete() {
    const doDelete = async () => {
      try {
        await ticketsApi.delete(ticket.id);
        onDeleted(ticket.id);
        onClose?.();
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.message ?? 'Could not delete ticket.');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this ticket? This action cannot be undone.')) doDelete();
    } else {
      Alert.alert('Delete Ticket', 'This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  const sc = STATUS_CFG[detail.status] ?? STATUS_CFG.open;
  const pc = PRIORITY_CFG[detail.priority as TicketPriority] ?? PRIORITY_CFG.medium;
  const nextStatuses = NEXT_STATUSES[detail.status] ?? [];

  if (editing) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[dp.header, t.chrome]}>
          <View style={{ flex: 1 }}>
            <Text style={dp.headerTitle}>Edit Ticket</Text>
            {detail.ticket_number && <Text style={dp.headerSub}>#{detail.ticket_number}</Text>}
          </View>
          <Pressable
            style={({ pressed }) => [dp.headerBtn, pressed && { opacity: 0.7 }]}
            onPress={() => setEditing(false)}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1, backgroundColor: '#f5f6f8' }} contentContainerStyle={{ padding: 16, gap: 14 }}>
          <View style={ef.field}>
            <Text style={ef.label}>Subject *</Text>
            <TextInput
              style={ef.input}
              value={editForm.subject}
              onChangeText={v => setEditForm(p => ({ ...p, subject: v }))}
              placeholder="Brief summary of the issue"
              placeholderTextColor="#9ca3af"
            />
          </View>
          <View style={ef.field}>
            <Text style={ef.label}>Description *</Text>
            <TextInput
              style={[ef.input, ef.textarea]}
              value={editForm.description}
              onChangeText={v => setEditForm(p => ({ ...p, description: v }))}
              placeholder="Describe the issue in detail..."
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
            />
          </View>
          <View style={ef.field}>
            <Text style={ef.label}>Priority</Text>
            <View style={ef.optRow}>
              {(Object.keys(PRIORITY_CFG) as TicketPriority[]).map(p => (
                <Pressable
                  key={p}
                  style={({ pressed }) => [ef.optBtn, editForm.priority === p && { backgroundColor: PRIORITY_CFG[p].color, borderColor: PRIORITY_CFG[p].color }, pressed && { opacity: 0.8 }]}
                  onPress={() => setEditForm(prev => ({ ...prev, priority: p }))}
                >
                  <Text style={[ef.optText, editForm.priority === p && { color: '#fff' }]}>{PRIORITY_CFG[p].label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={ef.field}>
            <Text style={ef.label}>Category</Text>
            <View style={ef.optRow}>
              {CATEGORIES.map(c => (
                <Pressable
                  key={c.key}
                  style={({ pressed }) => [ef.optBtn, editForm.category === c.key && { backgroundColor: '#1A2B1A', borderColor: '#1A2B1A' }, pressed && { opacity: 0.8 }]}
                  onPress={() => setEditForm(prev => ({ ...prev, category: c.key }))}
                >
                  <Text style={[ef.optText, editForm.category === c.key && { color: '#C9A52A' }]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [ef.saveBtn, t.chromeBtn, (editSaving) && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
            onPress={saveEdit}
            disabled={editSaving}
          >
            {editSaving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={ef.saveBtnText}>Save Changes</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[dp.header, t.chrome]}>
        <View style={{ flex: 1 }}>
          <Text style={dp.headerTitle} numberOfLines={1}>{detail.subject}</Text>
          {detail.ticket_number && <Text style={dp.headerSub}>#{detail.ticket_number}</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* Edit — hidden for closed tickets */}
          {detail.status !== 'closed' && (
            <Pressable
              style={({ pressed }) => [dp.headerBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setEditing(true)}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
            </Pressable>
          )}
          {/* Delete */}
          <Pressable
            style={({ pressed }) => [dp.headerBtn, { backgroundColor: 'rgba(220,38,38,0.25)' }, pressed && { opacity: 0.7 }]}
            onPress={confirmDelete}
          >
            <Ionicons name="trash-outline" size={18} color="#fca5a5" />
          </Pressable>
          {/* Close (mobile only) */}
          {onClose && (
            <Pressable
              style={({ pressed }) => [dp.headerBtn, pressed && { opacity: 0.7 }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: '#f5f6f8' }}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={{ paddingTop: 10, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#C9A52A" />
          </View>
        )}

        {/* ── Meta card ── */}
        <View style={dp.metaCard}>
          <View style={dp.metaRow}>
            <View style={[dp.statusBadge, { backgroundColor: sc.bg, borderColor: sc.color + '40' }]}>
              <Ionicons name={sc.icon} size={13} color={sc.color} />
              <Text style={[dp.statusText, { color: sc.color }]}>{sc.label}</Text>
            </View>
            <View style={[dp.priorityBadge, { borderColor: pc.color + '40' }]}>
              <Ionicons name={pc.icon} size={12} color={pc.color} />
              <Text style={[dp.priorityText, { color: pc.color }]}>{pc.label}</Text>
            </View>
            {detail.category && (
              <View style={dp.categoryBadge}>
                <Text style={dp.categoryText}>
                  {CATEGORIES.find(c => c.key === detail.category)?.label ?? detail.category}
                </Text>
              </View>
            )}
          </View>
          <View style={dp.dateRow}>
            <Text style={dp.dateLabel}>Opened</Text>
            <Text style={dp.dateVal}>{fmtDate(detail.created_at)}</Text>
          </View>
          {detail.updated_at && detail.updated_at !== detail.created_at && (
            <View style={dp.dateRow}>
              <Text style={dp.dateLabel}>Updated</Text>
              <Text style={dp.dateVal}>{fmtDate(detail.updated_at)}</Text>
            </View>
          )}
          {detail.assignee_name && (
            <View style={dp.dateRow}>
              <Text style={dp.dateLabel}>Assigned to</Text>
              <Text style={dp.dateVal}>{detail.assignee_name}</Text>
            </View>
          )}
          {detail.reporter_name && (
            <View style={dp.dateRow}>
              <Text style={dp.dateLabel}>Reported by</Text>
              <Text style={dp.dateVal}>{detail.reporter_name}</Text>
            </View>
          )}
        </View>

        {/* ── Description ── */}
        <View style={dp.section}>
          <Text style={dp.sectionTitle}>Description</Text>
          <Text style={dp.descText}>{detail.description}</Text>
        </View>

        {/* ── Status change actions ── */}
        {nextStatuses.length > 0 && (
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>Update Status</Text>
            <View style={dp.statusBtnRow}>
              {nextStatuses.map(s => {
                const cfg = STATUS_CFG[s];
                return (
                  <Pressable
                    key={s}
                    style={({ pressed }) => [dp.statusActionBtn, { borderColor: cfg.color, backgroundColor: cfg.bg }, pressed && { opacity: 0.8 }]}
                    onPress={() => changeStatus(s)}
                  >
                    <Ionicons name={cfg.icon} size={14} color={cfg.color} />
                    <Text style={[dp.statusActionText, { color: cfg.color }]}>
                      Mark {cfg.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Replies ── */}
        <View style={dp.section}>
          <Text style={dp.sectionTitle}>
            Replies {(detail.replies?.length ?? 0) > 0 ? `(${detail.replies!.length})` : ''}
          </Text>
          {!detail.replies || detail.replies.length === 0 ? (
            <View style={dp.noReplies}>
              <Ionicons name="chatbubbles-outline" size={28} color="#d1d5db" />
              <Text style={dp.noRepliesText}>No replies yet. Be the first to reply.</Text>
            </View>
          ) : (
            detail.replies.map(r => <ReplyBubble key={r.id} reply={r} />)
          )}
        </View>
      </ScrollView>

      {/* ── Reply input (only if ticket isn't closed) ── */}
      {detail.status !== 'closed' && (
        <View style={dp.replyBox}>
          <TextInput
            style={dp.replyInput}
            placeholder="Write a reply..."
            value={replyText}
            onChangeText={setReplyText}
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={2000}
          />
          <Pressable
            style={({ pressed }) => [dp.sendBtn, t.chromeBtn, (!replyText.trim() || sending) && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
            onPress={sendReply}
            disabled={!replyText.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
      )}
      {detail.status === 'closed' && (
        <View style={dp.closedBanner}>
          <Ionicons name="lock-closed-outline" size={14} color="#6b7280" />
          <Text style={dp.closedBannerText}>This ticket is closed. Reopen it to add replies.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Create ticket modal ────────────────────────────────────────────────────────
function CreateTicketModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (t: Ticket) => void;
}) {
  const t = useThemedScreen();
  const [form, setForm] = useState({
    subject: '', description: '', priority: 'medium', category: 'general',
  });
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setForm({ subject: '', description: '', priority: 'medium', category: 'general' });
  }

  async function submit() {
    if (!form.subject.trim())     { Alert.alert('Subject is required'); return; }
    if (!form.description.trim()) { Alert.alert('Description is required'); return; }
    setSaving(true);
    try {
      const res = await ticketsApi.create(form);
      const created: Ticket = res.data?.data ?? res.data;
      onCreated(created);
      resetForm();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not create ticket.');
    } finally { setSaving(false); }
  }

  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={cf.backdrop} onPress={onClose}>
          <Pressable style={[cf.panel, isDesktop && cf.panelDesktop]} onPress={() => {}}>
            {/* Header */}
            <View style={cf.header}>
              <View style={cf.headerLeft}>
                <View style={cf.headerIcon}>
                  <Ionicons name="headset-outline" size={16} color="#C9A52A" />
                </View>
                <View>
                  <Text style={cf.headerTitle}>New Support Ticket</Text>
                  <Text style={cf.headerSub}>Submit an issue to our support team</Text>
                </View>
              </View>
              <Pressable onPress={onClose} style={({ pressed }) => [cf.closeBtn, pressed && { opacity: 0.7 }]}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 18, gap: 16 }}
              keyboardShouldPersistTaps="handled">

              <View style={ef.field}>
                <Text style={ef.label}>Subject <Text style={{ color: '#ef4444' }}>*</Text></Text>
                <TextInput
                  style={ef.input}
                  value={form.subject}
                  onChangeText={v => setForm(p => ({ ...p, subject: v }))}
                  placeholder="Brief summary of your issue"
                  placeholderTextColor="#9ca3af"
                  autoFocus
                />
              </View>

              <View style={ef.field}>
                <Text style={ef.label}>Description <Text style={{ color: '#ef4444' }}>*</Text></Text>
                <TextInput
                  style={[ef.input, ef.textarea]}
                  value={form.description}
                  onChangeText={v => setForm(p => ({ ...p, description: v }))}
                  placeholder="Describe the issue in detail — steps to reproduce, screenshots info, etc."
                  placeholderTextColor="#9ca3af"
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <View style={ef.field}>
                <Text style={ef.label}>Priority</Text>
                <View style={ef.optRow}>
                  {(Object.keys(PRIORITY_CFG) as TicketPriority[]).map(p => (
                    <Pressable
                      key={p}
                      style={({ pressed }) => [ef.optBtn, form.priority === p && { backgroundColor: PRIORITY_CFG[p].color, borderColor: PRIORITY_CFG[p].color }, pressed && { opacity: 0.8 }]}
                      onPress={() => setForm(prev => ({ ...prev, priority: p }))}
                    >
                      <Ionicons name={PRIORITY_CFG[p].icon} size={12} color={form.priority === p ? '#fff' : PRIORITY_CFG[p].color} />
                      <Text style={[ef.optText, form.priority === p && { color: '#fff' }]}>{PRIORITY_CFG[p].label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={ef.field}>
                <Text style={ef.label}>Category</Text>
                <View style={ef.optRow}>
                  {CATEGORIES.map(c => (
                    <Pressable
                      key={c.key}
                      style={({ pressed }) => [ef.optBtn, form.category === c.key && { backgroundColor: '#1A2B1A', borderColor: '#1A2B1A' }, pressed && { opacity: 0.8 }]}
                      onPress={() => setForm(prev => ({ ...prev, category: c.key }))}
                    >
                      <Text style={[ef.optText, form.category === c.key && { color: '#C9A52A' }]}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={cf.footer}>
              <Pressable style={({ pressed }) => [cf.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onClose}>
                <Text style={cf.cancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [cf.submitBtn, saving && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
                onPress={submit}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#C9A52A" size="small" />
                  : <>
                      <Ionicons name="add-circle-outline" size={17} color="#C9A52A" />
                      <Text style={cf.submitTxt}>Submit Ticket</Text>
                    </>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Tab options ────────────────────────────────────────────────────────────────
const TAB_OPTIONS = [
  { key: 'all',        label: 'All visible tickets' },
  { key: 'mine',       label: 'My Tickets'          },
  { key: 'unassigned', label: 'Unassigned'          },
];

// ── Inline dropdown ────────────────────────────────────────────────────────────
function FilterDropdown({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.key === value);
  return (
    <View style={{ gap: 3, position: 'relative', zIndex: 200 }}>
      <Text style={fd.lbl}>{label}</Text>
      <Pressable style={fd.btn} onPress={e => { e.stopPropagation?.(); setOpen(p => !p); }}>
        <Text style={fd.btnTxt} numberOfLines={1}>{selected?.label ?? 'Any'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color="#6b7280" />
      </Pressable>
      {open && (
        <View style={fd.menu}>
          {options.map(o => (
            <Pressable key={o.key} style={[fd.item, value === o.key && fd.itemActive]}
              onPress={() => { onChange(o.key); setOpen(false); }}>
              <Text style={[fd.itemTxt, value === o.key && fd.itemTxtActive]}>{o.label}</Text>
              {value === o.key && <Ionicons name="checkmark" size={12} color="#1A2B1A" />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Table row (desktop) ────────────────────────────────────────────────────────
function TableRow({ ticket, onView }: { ticket: Ticket; onView: () => void }) {
  const sc2 = STATUS_CFG[ticket.status] ?? STATUS_CFG.open;
  const pc  = PRIORITY_CFG[ticket.priority as TicketPriority] ?? PRIORITY_CFG.medium;
  return (
    <View style={tr.row}>
      <Text style={[tr.cell, tr.cellNum]}>#{ticket.ticket_number ?? ticket.id}</Text>
      <View style={[tr.cell, { flex: 2.5 }]}>
        <Text style={tr.subject} numberOfLines={1}>{ticket.subject}</Text>
        {ticket.category ? <Text style={tr.catLabel}>{CATEGORIES.find(c => c.key === ticket.category)?.label ?? ticket.category}</Text> : null}
      </View>
      <Text style={[tr.cell, tr.cellFrom]} numberOfLines={1}>{ticket.reporter_name ?? '—'}</Text>
      <View style={[tr.cell, tr.cellPriority]}>
        <View style={[tr.badge, { backgroundColor: pc.color + '15', borderColor: pc.color + '40' }]}>
          <Ionicons name={pc.icon} size={10} color={pc.color} />
          <Text style={[tr.badgeTxt, { color: pc.color }]}>{pc.label}</Text>
        </View>
      </View>
      <View style={[tr.cell, tr.cellStatus]}>
        <View style={[tr.badge, { backgroundColor: sc2.bg, borderColor: sc2.color + '40' }]}>
          <Ionicons name={sc2.icon} size={10} color={sc2.color} />
          <Text style={[tr.badgeTxt, { color: sc2.color }]}>{sc2.label}</Text>
        </View>
      </View>
      <Text style={[tr.cell, tr.cellAssignee]} numberOfLines={1}>{ticket.assignee_name ?? '—'}</Text>
      <Text style={[tr.cell, tr.cellDate]}>{ticket.created_at ? format(new Date(ticket.created_at), 'dd MMM yyyy') : '—'}</Text>
      <View style={[tr.cell, tr.cellActions]}>
        <Pressable style={({ pressed }) => [tr.viewBtn, pressed && { opacity: 0.7 }]} onPress={onView}>
          <Ionicons name="eye-outline" size={13} color="#1A2B1A" />
          <Text style={tr.viewTxt}>View</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function TicketsScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;

  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected]     = useState<Ticket | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Filter state (pending — applied on "Apply")
  const [tabFilter,      setTabFilter]      = useState('all');
  const [statusFilter,   setStatusFilter]   = useState('any');
  const [priorityFilter, setPriorityFilter] = useState('any');
  const [search,         setSearch]         = useState('');
  // Applied
  const [appliedTab,      setAppliedTab]      = useState('all');
  const [appliedStatus,   setAppliedStatus]   = useState('any');
  const [appliedPriority, setAppliedPriority] = useState('any');
  const [appliedSearch,   setAppliedSearch]   = useState('');

  const load = useCallback(async () => {
    try {
      const res = await ticketsApi.list({ per_page: 100 });
      const data = res.data?.data ?? res.data ?? [];
      setTickets(Array.isArray(data) ? data : []);
    } catch { /* offline */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  function applyFilter() {
    setAppliedTab(tabFilter);
    setAppliedStatus(statusFilter);
    setAppliedPriority(priorityFilter);
    setAppliedSearch(search);
  }

  const filtered = tickets.filter(tk => {
    if (appliedStatus !== 'any'   && tk.status   !== appliedStatus)                     return false;
    if (appliedPriority !== 'any' && tk.priority  !== appliedPriority)                  return false;
    const q = appliedSearch.trim().toLowerCase();
    if (q && !tk.subject.toLowerCase().includes(q) && !tk.description.toLowerCase().includes(q)
          && !(tk.ticket_number ?? '').toLowerCase().includes(q))                       return false;
    return true;
  });

  const countFor = (s: string) =>
    s === 'all' ? tickets.length : tickets.filter(tk => tk.status === s).length;

  function handleSelect(tk: Ticket) { setSelected(tk); if (!isDesktop) setShowDetail(true); }
  function handleUpdated(updated: Ticket) {
    setSelected(updated);
    setTickets(prev => prev.map(tk => tk.id === updated.id ? { ...tk, ...updated } : tk));
  }
  function handleDeleted(id: number) {
    setTickets(prev => prev.filter(tk => tk.id !== id));
    setSelected(null); setShowDetail(false);
  }
  function handleCreated(tk: Ticket) {
    setTickets(prev => [tk, ...prev]);
    setSelected(tk);
    if (!isDesktop) setShowDetail(true);
  }

  const statusOptions = [
    { key: 'any', label: 'Any' },
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'closed', label: 'Closed' },
  ];
  const priorityOptions = [
    { key: 'any',    label: 'Any'    },
    { key: 'low',    label: 'Low'    },
    { key: 'medium', label: 'Medium' },
    { key: 'high',   label: 'High'   },
    { key: 'urgent', label: 'Urgent' },
  ];

  const STAT_ITEMS = [
    { key: 'all',         label: 'Total',       color: '#2563eb', bg: '#eff6ff', icon: 'ticket-outline'               as const },
    { key: 'open',        label: 'Open',        color: '#2563eb', bg: '#eff6ff', icon: 'radio-button-on-outline'      as const },
    { key: 'in_progress', label: 'In Progress', color: '#d97706', bg: '#fef9ec', icon: 'sync-outline'                 as const },
    { key: 'resolved',    label: 'Resolved',    color: '#16a34a', bg: '#f0fdf4', icon: 'checkmark-circle-outline'     as const },
    { key: 'closed',      label: 'Closed',      color: '#d97706', bg: '#fef9ec', icon: 'lock-closed-outline'          as const },
  ];

  const tableHeader = (
    <View style={tr.header}>
      <Text style={[tr.hCell, tr.cellNum]}>#</Text>
      <Text style={[tr.hCell, { flex: 2.5 }]}>Subject</Text>
      <Text style={[tr.hCell, tr.cellFrom]}>From</Text>
      <Text style={[tr.hCell, tr.cellPriority]}>Priority</Text>
      <Text style={[tr.hCell, tr.cellStatus]}>Status</Text>
      <Text style={[tr.hCell, tr.cellAssignee]}>Assignee</Text>
      <Text style={[tr.hCell, tr.cellDate]}>Created</Text>
      <Text style={[tr.hCell, tr.cellActions]}>Actions</Text>
    </View>
  );

  return (
    <Pressable style={{ flex: 1, backgroundColor: '#f4f6f9' }} onPress={() => {}}>
      {/* ── Header ── */}
      <View style={sc.header}>
        <View>
          <Text style={sc.headerTitle}>Support Tickets</Text>
          <Text style={sc.headerSub}>Raise issues to the platform admin team and track their status.</Text>
        </View>
        <Pressable style={({ pressed }) => [sc.newBtn, pressed && { opacity: 0.85 }]} onPress={() => setShowCreate(true)}>
          <Ionicons name="add-circle-outline" size={15} color="#fff" />
          <Text style={sc.newBtnTxt}>New Ticket</Text>
        </Pressable>
      </View>

      {/* ── Stat cards ── */}
      <View style={sc.statsRow}>
        {STAT_ITEMS.map(s => (
          <View key={s.key} style={[sc.statCard, s.key !== 'all' && { borderLeftWidth: 1, borderLeftColor: '#e5e7eb' }]}>
            <View style={[sc.statIconWrap, { backgroundColor: s.bg }]}>
              <Ionicons name={s.icon} size={18} color={s.color} />
            </View>
            <Text style={sc.statLbl}>{s.label}</Text>
            <Text style={[sc.statVal, { color: s.color }]}>{countFor(s.key)}</Text>
          </View>
        ))}
      </View>

      {/* ── Filter bar ── */}
      <View style={sc.filterBar}>
        <FilterDropdown label="Tab"      value={tabFilter}      options={TAB_OPTIONS}      onChange={setTabFilter} />
        <FilterDropdown label="Status"   value={statusFilter}   options={statusOptions}    onChange={setStatusFilter} />
        <FilterDropdown label="Priority" value={priorityFilter} options={priorityOptions}  onChange={setPriorityFilter} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={fd.lbl}>Search</Text>
          <TextInput
            style={sc.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Subject or description..."
            placeholderTextColor="#9ca3af"
            onSubmitEditing={applyFilter}
          />
        </View>
        <Pressable style={({ pressed }) => [sc.applyBtn, pressed && { opacity: 0.85 }]} onPress={applyFilter}>
          <Text style={sc.applyBtnTxt}>Apply</Text>
        </Pressable>
      </View>

      {/* ── Table / list ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color="#1A2B1A" />
          <Text style={{ color: '#6b7280', fontSize: 14 }}>Loading tickets...</Text>
        </View>
      ) : isDesktop ? (
        /* Desktop table */
        <View style={{ flex: 1, margin: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
          {tableHeader}
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#1A2B1A" />}>
            {filtered.length === 0 ? (
              <View style={sc.empty}>
                <Text style={sc.emptyTxt}>No tickets match your filters.</Text>
              </View>
            ) : (
              filtered.map((tk, i) => (
                <View key={tk.id} style={i % 2 === 1 ? { backgroundColor: '#fafafa' } : {}}>
                  <TableRow ticket={tk} onView={() => handleSelect(tk)} />
                </View>
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        /* Mobile card list */
        <FlatList
          data={filtered}
          keyExtractor={tk => String(tk.id)}
          renderItem={({ item: tk }) => (
            <TicketCard ticket={tk} selected={selected?.id === tk.id} onPress={() => handleSelect(tk)} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#1A2B1A" />}
          contentContainerStyle={{ padding: 10, gap: 8, paddingBottom: 40, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={sc.empty}>
              <Ionicons name="headset-outline" size={44} color="#d1d5db" />
              <Text style={sc.emptyTxt}>No tickets match your filters.</Text>
            </View>
          }
        />
      )}

      {/* Create modal */}
      <CreateTicketModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={handleCreated} />

      {/* Mobile: detail modal */}
      {!isDesktop && (
        <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet"
          onRequestClose={() => setShowDetail(false)}>
          <View style={{ flex: 1, backgroundColor: '#f5f6f8' }}>
            {selected && (
              <TicketDetail key={selected.id} ticket={selected}
                onClose={() => setShowDetail(false)}
                onUpdated={handleUpdated} onDeleted={handleDeleted} />
            )}
          </View>
        </Modal>
      )}

      {/* Desktop: detail modal (centered) */}
      {isDesktop && selected && (
        <Modal visible={!!selected} transparent animationType="fade"
          onRequestClose={() => setSelected(null)}>
          <Pressable style={sc.modalBackdrop} onPress={() => setSelected(null)}>
            <Pressable style={sc.modalPanel} onPress={() => {}}>
              <TicketDetail key={selected.id} ticket={selected}
                onClose={() => setSelected(null)}
                onUpdated={handleUpdated} onDeleted={handleDeleted} />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Pressable>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerSub:   { fontSize: 12, color: '#C9A52A', marginTop: 2, fontWeight: '600' },
  newBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1A2B1A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  newBtnTxt:   { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Stats
  statsRow:    { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  statCard:    { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  statIconWrap:{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  statLbl:     { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  statVal:     { fontSize: 18, fontWeight: '800' },

  // Filter
  filterBar:   { flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#111827', minWidth: 160 },
  applyBtn:    { alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: '#111827', backgroundColor: '#fff' },
  applyBtnTxt: { fontWeight: '700', fontSize: 13, color: '#111827' },

  // Empty
  empty:    { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { fontSize: 14, fontWeight: '600', color: '#C9A52A' },

  // Desktop modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalPanel:    { width: 720, maxWidth: '95%', maxHeight: '90%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
});

// FilterDropdown styles
const fd = StyleSheet.create({
  lbl:         { fontSize: 10.5, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 },
  btn:         { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', minWidth: 130 },
  btnTxt:      { flex: 1, fontSize: 13, color: '#374151' },
  menu:        { position: 'absolute', top: 60, left: 0, minWidth: 160, zIndex: 999, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 10, overflow: 'hidden' },
  item:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  itemActive:  { backgroundColor: '#f0fdf4' },
  itemTxt:     { flex: 1, fontSize: 13, color: '#374151' },
  itemTxtActive:{ fontWeight: '700', color: '#1A2B1A' },
});

// Table row styles
const tr = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  hCell:        { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 },
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  cell:         { fontSize: 13, color: '#374151' },
  cellNum:      { width: 70 },
  cellFrom:     { flex: 1.2 },
  cellPriority: { flex: 1, alignItems: 'flex-start' },
  cellStatus:   { flex: 1.2, alignItems: 'flex-start' },
  cellAssignee: { flex: 1.2 },
  cellDate:     { flex: 1.2 },
  cellActions:  { width: 80, alignItems: 'flex-end' },
  subject:      { fontSize: 13, fontWeight: '700', color: '#111827' },
  catLabel:     { fontSize: 10, color: '#9ca3af', marginTop: 1 },
  badge:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeTxt:     { fontSize: 11, fontWeight: '600' },
  viewBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  viewTxt:      { fontSize: 11, fontWeight: '700', color: '#1A2B1A' },
});

const tc = StyleSheet.create({
  row:         { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', borderLeftWidth: 3, borderLeftColor: '#e5e7eb', backgroundColor: '#fff' },
  rowSelected: { backgroundColor: 'rgba(201,165,42,0.06)', borderLeftColor: '#C9A52A' },
  topRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  subject:     { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#111827' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  statusText:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  desc:        { fontSize: 12, color: '#6b7280', marginBottom: 6, lineHeight: 17 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ticketNum:   { fontSize: 11, fontWeight: '700', color: '#9ca3af' },
  priorityDot: { width: 7, height: 7, borderRadius: 4 },
  priorityLabel: { fontSize: 11, fontWeight: '600' },
  category:    { fontSize: 11, color: '#9ca3af' },
  replyCount:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  replyCountText: { fontSize: 10.5, color: '#6b7280' },
  date:        { fontSize: 10.5, color: '#9ca3af', marginTop: 4 },
});

const rb = StyleSheet.create({
  wrap:       { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  wrapStaff:  { flexDirection: 'row' },
  wrapUser:   { flexDirection: 'row-reverse' },
  avatar:     { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  avatarStaff:{ backgroundColor: '#1A2B1A' },
  avatarUser: { backgroundColor: '#0D76E1' },
  bubble:     { flex: 1, borderRadius: 12, padding: 10, maxWidth: '85%' },
  bubbleStaff:{ backgroundColor: '#f8f9fb', borderWidth: 1, borderColor: '#e5e7eb', borderTopLeftRadius: 2 },
  bubbleUser: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderTopRightRadius: 2 },
  bubbleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  bubbleName: { fontSize: 11, fontWeight: '700', color: '#374151' },
  bubbleTime: { fontSize: 10, color: '#9ca3af' },
  bubbleMsg:  { fontSize: 13.5, color: '#111827', lineHeight: 20 },
});

const dp = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#1A2B1A' },
  headerTitle: { fontSize: 14, fontWeight: '800', color: '#C9A52A' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  headerBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  metaCard:    { margin: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb', gap: 8 },
  metaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  statusText:  { fontSize: 12, fontWeight: '700' },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1, backgroundColor: '#fff' },
  priorityText:  { fontSize: 12, fontWeight: '700' },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  categoryText:  { fontSize: 12, color: '#374151', fontWeight: '500' },
  dateRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  dateLabel:   { fontSize: 12, color: '#9ca3af' },
  dateVal:     { fontSize: 12, color: '#374151', fontWeight: '500' },

  section:        { marginHorizontal: 12, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  sectionTitle:   { fontSize: 11, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  descText:       { fontSize: 14, color: '#374151', lineHeight: 22 },

  statusBtnRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusActionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  statusActionText: { fontSize: 12.5, fontWeight: '700' },

  noReplies:     { alignItems: 'center', gap: 8, paddingVertical: 20 },
  noRepliesText: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },

  replyBox:  { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', alignItems: 'flex-end' },
  replyInput:{ flex: 1, backgroundColor: '#f5f6f8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb', maxHeight: 100 },
  sendBtn:   { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  closedBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#f3f4f6', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  closedBannerText: { fontSize: 12.5, color: '#6b7280', flex: 1 },
});

const ef = StyleSheet.create({
  field:      { gap: 7 },
  label:      { fontSize: 13, fontWeight: '600', color: '#374151' },
  input:      { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  textarea:   { height: 110, textAlignVertical: 'top', paddingTop: 12 },
  optRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb' },
  optText:    { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, marginTop: 8 },
  saveBtnText:{ fontSize: 15, fontWeight: '800', color: '#C9A52A' },
});

const cf = StyleSheet.create({
  backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel:        { width: '100%', maxHeight: '90%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 20 },
  panelDesktop: { width: 580, maxWidth: 580 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: '#1A2B1A' },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(201,165,42,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,165,42,0.25)' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  closeBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },

  footer:      { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fff' },
  cancelBtn:   { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 11, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  cancelTxt:   { fontWeight: '700', color: '#374151', fontSize: 14 },
  submitBtn:   { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 11, backgroundColor: '#1A2B1A' },
  submitTxt:   { fontWeight: '800', color: '#C9A52A', fontSize: 14 },
});
