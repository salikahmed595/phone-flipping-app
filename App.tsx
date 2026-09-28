import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import {
  addDevice,
  addExpense,
  addPart,
  changePassword,
  fetchActiveWarranties,
  fetchDeviceHistory,
  fetchDevices,
  fetchDiagnostics,
  fetchExpenses,
  fetchParts,
  fetchProfile,
  fetchSalesHistory,
  fetchVerificationChecks,
  getDashboardStats,
  logRepair,
  markReadyForSale,
  recordSale,
  recordTradeIn,
  requestVerification,
  saveDiagnosticResult,
  signIn as apiSignIn,
  signOut as apiSignOut,
  signUp as apiSignUp,
  subscribeToDevices,
  updateFullName,
  uploadAvatar,
} from './src/lib/api';
import { enqueue, flushQueue, getQueue, isOnline, subscribeConnectivity } from './src/lib/offlineQueue';
import { buildMarketplaceListing, exportInventoryCsv, shareDeviceReceipt, shareListingViaWhatsApp } from './src/lib/exports';
import type { ActiveWarranty, DashboardStats, Device as ApiDevice, DeviceHistoryEntry, DiagnosticResult, Part, Profile, QueuedActionType, SaleRecord, VerificationCheck } from './src/lib/types';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
type Tab = 'Home' | 'Inventory' | 'Add' | 'Activity' | 'More';
type Status = 'Purchased' | 'In repair' | 'Ready for sale' | 'Sold';
type Device = { uuid: string; id: string; model: string; storage: string; imei: string; imei2?: string; pta: string; status: Status; cost: number; repair: number; tax: number; sale?: number; date: string; initials: string; tint: string };
type Expense = { id: string; title: string; category: string; amount: number; date: string };
const purple = '#6945D9';
const ink = '#232139';
const muted = '#8A879B';
const border = '#EEEDF4';
const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => 'Rs ' + Math.round(n).toLocaleString('en-PK');
const tints = ['#E8E3F7', '#E8E7F0', '#F1E8F3', '#E5EBF4', '#EBE6FA'];
const tintFor = (seed: string) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return tints[h % tints.length]; };
const toUiDevice = (d: ApiDevice): Device => ({ uuid: d.uuid, id: d.id, model: d.model, storage: d.storage, imei: d.imei, imei2: d.imei2, pta: d.pta, status: d.status, cost: d.cost, repair: d.repair, tax: d.tax, sale: d.sale, date: d.date, initials: d.model.slice(0, 2).toUpperCase(), tint: tintFor(d.model) });
const statusColors: Record<Status, [string, string]> = { Purchased: ['#F1F0FA', '#6B62A8'], 'In repair': ['#FFF3E6', '#BC7726'], 'Ready for sale': ['#E9F7F0', '#308D5D'], Sold: ['#EEEAFB', purple] };
function I({ name, size = 20, color = ink }: { name: Icon; size?: number; color?: string }) { return <Ionicons name={name} size={size} color={color} />; }
function Button({ title, icon, onPress, secondary = false, small = false }: { title: string; icon?: Icon; onPress: () => void; secondary?: boolean; small?: boolean }) { return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, small && { paddingVertical: 11, paddingHorizontal: 14 }]}>{icon && <I name={icon} size={18} color={secondary ? purple : '#fff'} />}<Text style={[styles.buttonText, secondary && { color: purple }]}>{title}</Text></Pressable>; }
function Pill({ text, bg, color }: { text: string; bg: string; color: string }) { return <View style={[styles.pill, { backgroundColor: bg }]}><Text style={{ color, fontSize: 11, fontWeight: '700' }}>{text}</Text></View>; }
function Section({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) { return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{action && <Pressable onPress={onPress}><Text style={styles.link}>{action}  →</Text></Pressable>}</View>; }
function Stat({ icon, label, value, sub, tone = 'purple' }: { icon: Icon; label: string; value: string; sub?: string; tone?: 'purple' | 'orange' | 'green' }) { const c = tone === 'green' ? '#22956A' : tone === 'orange' ? '#D48431' : purple; return <View style={styles.stat}><View style={[styles.statIcon, { backgroundColor: c + '13' }]}><I name={icon} size={19} color={c} /></View><Text style={styles.statLabel}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>{value}</Text>{sub && <Text style={styles.statSub}>{sub}</Text>}</View>; }
function DeviceCard({ device, onPress }: { device: Device; onPress: () => void }) { const [bg, color] = statusColors[device.status]; return <Pressable onPress={onPress} style={styles.deviceCard}><View style={[styles.phoneArt, { backgroundColor: device.tint }]}><View style={styles.phoneShape}><View style={styles.lensRow}><View style={styles.lens}/><View style={styles.lens}/></View></View></View><View style={{ flex: 1, gap: 5 }}><Text style={styles.deviceName}>{device.model}</Text><Text style={styles.meta}>{device.storage}  ·  {device.pta}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Pill text={device.status} bg={bg} color={color}/><Text style={styles.deviceId}>{device.id}</Text></View></View><I name="chevron-forward" size={17} color="#B6B2C3" /></Pressable>; }
function Field({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, autoCapitalize }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: 'numeric' | 'default' | 'email-address'; secureTextEntry?: boolean; autoCapitalize?: 'none' | 'sentences' }) { return <View style={{ marginBottom: 17 }}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#B5B1C1" keyboardType={keyboardType || 'default'} secureTextEntry={secureTextEntry} autoCapitalize={autoCapitalize || 'sentences'} /></View>; }
function authErrorMessage(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes('invalid login credentials')) return "That email or password doesn't match our records. Check for typos, or create an account if you're new here.";
  if (msg.includes('already registered') || msg.includes('already exists')) return 'An account with that email already exists — try signing in instead.';
  if (msg.includes('password') && (msg.includes('6 character') || msg.includes('short'))) return 'Your password needs to be at least 6 characters.';
  if (msg.includes('unable to validate email') || msg.includes('invalid email') || msg.includes('invalid format')) return "That doesn't look like a valid email address.";
  if (msg.includes('email not confirmed')) return 'Confirm your email first — check your inbox for the link we sent, then come back and sign in.';
  if (msg.includes('rate limit') || msg.includes('too many')) return "You've tried a few too many times — wait a minute and try again.";
  if (msg.includes('network') || msg.includes('fetch')) return "Couldn't reach the server. Check your internet connection and try again.";
  return raw;
}
function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const switchMode = (next: 'in' | 'up') => { setMode(next); setError(null); setNotice(null); };
  const submit = async () => {
    setError(null);
    setNotice(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) { setError('Enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError("That doesn't look like a valid email address."); return; }
    if (password.length < 6) { setError('Your password needs to be at least 6 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'in') {
        await apiSignIn(cleanEmail, password);
      } else {
        const session = await apiSignUp(cleanEmail, password, fullName.trim());
        if (!session) {
          setNotice(`Almost done — we sent a confirmation link to ${cleanEmail}. Open it, then sign in below.`);
          setMode('in');
        }
      }
    } catch (err: any) {
      setError(authErrorMessage(err?.message ?? String(err)));
    } finally {
      setBusy(false);
    }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FBFAFE' }}><View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}><View style={{ alignItems: 'center', marginBottom: 34 }}><View style={[styles.brandIcon, { width: 52, height: 52, borderRadius: 16, marginBottom: 14 }]}><I name="swap-horizontal" size={26} color="#fff" /></View><Text style={[styles.brandName, { fontSize: 26 }]}>flipwise<Text style={{ color: purple }}>.</Text></Text><Text style={[styles.subtitle, { textAlign: 'center', marginTop: 8 }]}>{mode === 'in' ? 'Sign in to your workspace' : 'Create your workspace in a few seconds'}</Text></View>
  {notice && <View style={{ flexDirection: 'row', gap: 8, backgroundColor: '#F0EBFC', borderRadius: 10, padding: 12, marginBottom: 16, alignItems: 'flex-start' }}><I name="mail-outline" size={16} color={purple} /><Text style={{ color: '#4C339E', fontSize: 12, lineHeight: 17, flex: 1 }}>{notice}</Text></View>}
  {error && <View style={{ flexDirection: 'row', gap: 8, backgroundColor: '#FDECEA', borderRadius: 10, padding: 12, marginBottom: 16, alignItems: 'flex-start' }}><I name="alert-circle-outline" size={16} color="#B3261E" /><Text style={{ color: '#B3261E', fontSize: 12, lineHeight: 17, flex: 1 }}>{error}</Text></View>}
  {mode === 'up' && <Field label="Full name (optional)" value={fullName} onChangeText={setFullName} placeholder="e.g. Salik Ahmed" />}
  <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@business.com" keyboardType="email-address" autoCapitalize="none" />
  <View style={{ marginBottom: 17 }}>
    <Text style={styles.fieldLabel}>Password</Text>
    <View style={{ justifyContent: 'center' }}>
      <TextInput accessibilityLabel="Password" style={[styles.input, { paddingRight: 44 }]} value={password} onChangeText={setPassword} placeholder="At least 6 characters" placeholderTextColor="#B5B1C1" secureTextEntry={!showPassword} autoCapitalize="none" />
      <Pressable onPress={() => setShowPassword(s => !s)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} accessibilityRole="button" style={{ position: 'absolute', right: 4, top: 0, height: 45, width: 40, alignItems: 'center', justifyContent: 'center' }}>
        <I name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={muted} />
      </Pressable>
    </View>
  </View>
  <Button title={busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'} onPress={submit} />
  <Pressable onPress={() => switchMode(mode === 'in' ? 'up' : 'in')} style={{ marginTop: 18, alignItems: 'center' }}><Text style={styles.link}>{mode === 'in' ? 'New here? Create a workspace' : 'Already have an account? Sign in'}</Text></Pressable></View></SafeAreaView>;
}
function Empty({ icon, title, subtitle }: { icon: Icon; title: string; subtitle: string }) { return <View style={styles.empty}><View style={styles.emptyIcon}><I name={icon} size={25} color={purple}/></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{subtitle}</Text></View>; }
function WebScanner({ mode, onScanned, onClose }: { mode: 'imei' | 'lookup'; onScanned: (data: string) => void; onClose: () => void }) {
  const videoHostRef = React.useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const lockedRef = React.useRef(false);
  useEffect(() => {
    let reader: any;
    let videoEl: any;
    let cancelled = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/library');
        if (cancelled) return;
        reader = new BrowserMultiFormatReader();
        videoEl = (globalThis as any).document.createElement('video');
        videoEl.setAttribute('playsinline', 'true');
        videoEl.muted = true;
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
        videoEl.style.objectFit = 'cover';
        if (videoHostRef.current) videoHostRef.current.appendChild(videoEl);
        const devices = await reader.listVideoInputDevices();
        const backCam = devices.find((d: any) => /back|rear|environment/i.test(d.label));
        const deviceId = (backCam ?? devices[devices.length - 1])?.deviceId;
        await reader.decodeFromVideoDevice(deviceId, videoEl, (result: any) => {
          if (result && !lockedRef.current) {
            lockedRef.current = true;
            onScanned(result.getText());
          }
        });
      } catch (err: any) {
        setError(err?.message ?? 'Could not access the camera. Check your browser permissions.');
      }
    })();
    return () => {
      cancelled = true;
      try { reader && reader.reset(); } catch {}
      try { videoEl && videoEl.parentNode && videoEl.parentNode.removeChild(videoEl); } catch {}
    };
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#000' }}>
    {error ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <I name="camera-outline" color="#fff" size={36} />
      <Text style={{ color: '#fff', textAlign: 'center', marginTop: 16, fontSize: 14, lineHeight: 20 }}>{error}</Text>
    </View> : React.createElement('div', { ref: videoHostRef, style: { width: '100%', height: '100%' } })}
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 24, paddingHorizontal: 24, backgroundColor: 'rgba(0,0,0,0.35)' }}>
      <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 13 }}>{mode === 'imei' ? 'Point the camera at the IMEI barcode' : "Point the camera at a device's QR label"}</Text>
      <Text style={{ color: '#fff', textAlign: 'center', fontSize: 11, opacity: 0.7, marginTop: 4 }}>Open-source scanning via ZXing — works right in the browser</Text>
    </View>
    <View style={{ position: 'absolute', left: '15%', right: '15%', top: '35%', bottom: '35%', borderWidth: 2, borderColor: '#fff', borderRadius: 18, opacity: 0.85 }} />
    <Pressable onPress={onClose} style={{ position: 'absolute', top: 20, right: 20, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
      <I name="close" color="#fff" size={20} />
    </Pressable>
  </View>;
}
function Scanner({ mode, onScanned, onClose }: { mode: 'imei' | 'lookup'; onScanned: (data: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  if (Platform.OS === 'web') {
    return <WebScanner mode={mode} onScanned={onScanned} onClose={onClose}/>;
  }
  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission.granted) {
    return <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <I name="camera-outline" color="#fff" size={36} />
      <Text style={{ color: '#fff', textAlign: 'center', marginTop: 16, marginBottom: 20, fontSize: 14 }}>Flipwise needs camera access to scan {mode === 'imei' ? 'an IMEI barcode' : 'a device QR label'}.</Text>
      <Pressable onPress={requestPermission} style={{ backgroundColor: purple, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12, marginBottom: 12 }}><Text style={{ color: '#fff', fontWeight: '700' }}>Grant camera access</Text></Pressable>
      <Pressable onPress={onClose}><Text style={{ color: '#fff', opacity: 0.7 }}>Cancel</Text></Pressable>
    </View>;
  }
  return <View style={{ flex: 1, backgroundColor: '#000' }}>
    <CameraView
      style={{ flex: 1 }}
      barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'code39', 'upc_a', 'upc_e', 'pdf417'] }}
      onBarcodeScanned={locked ? undefined : (result) => { setLocked(true); onScanned(result.data); }}
    />
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 54, paddingHorizontal: 24, backgroundColor: 'rgba(0,0,0,0.35)' }}>
      <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 13 }}>{mode === 'imei' ? 'Scan the IMEI barcode on the box or under the SIM tray' : "Scan a device's QR label to open it"}</Text>
    </View>
    <View style={{ position: 'absolute', left: '15%', right: '15%', top: '35%', bottom: '35%', borderWidth: 2, borderColor: '#fff', borderRadius: 18, opacity: 0.85 }} />
    <Pressable onPress={onClose} style={{ position: 'absolute', top: 50, right: 20, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
      <I name="close" color="#fff" size={20} />
    </Pressable>
  </View>;
}
function AppContent({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('Home');
  const [devices, setDevices] = useState<Device[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'device' | 'expense' | 'sale' | 'repair' | 'part' | 'export' | null>(null);
  const role: 'Owner' | 'Technician' = profile.role === 'owner' ? 'Owner' : 'Technician';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState({ model: '', storage: '', imei: '', imei2: '', price: '', pta: 'PTA Approved', softwareStatus: 'OEM Unlocked', condition: '', ptaTax: '', title: '', amount: '', partId: '', sale: '', warrantyDays: 7 as 3 | 7, tradeIn: false, tiModel: '', tiStorage: '', tiImei: '', tiValue: '' });
  const [parts, setParts] = useState<Part[]>([]);
  const [deviceHistory, setDeviceHistory] = useState<DeviceHistoryEntry[]>([]);
  const [diagnostics2, setDiagnostics2] = useState<DiagnosticResult[]>([]);
  const [activeWarranties, setActiveWarranties] = useState<ActiveWarranty[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.fullName ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [exportRange, setExportRange] = useState<'3d' | '7d' | '15d' | '1m' | 'custom' | null>(null);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [verifChecks, setVerifChecks] = useState<VerificationCheck[]>([]);
  const [checkingVerif, setCheckingVerif] = useState(false);
  const [scanner, setScanner] = useState<'imei' | 'lookup' | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const { width } = useWindowDimensions();
  const desktop = width > 820;
  const active = devices.find(d => d.id === selected);
  const unsold = devices.filter(d => d.status !== 'Sold');
  const sold = devices.filter(d => d.status === 'Sold');
  const visible = devices.filter(d => (filter === 'All' || d.status === filter) && (d.model + d.imei + d.id).toLowerCase().includes(query.toLowerCase()));
  const refresh = async () => {
    try {
      const [d, s] = await Promise.all([fetchDevices(), getDashboardStats()]);
      setDevices(d.map(toUiDevice));
      setStats(s);
      if (profile.role === 'owner') {
        setExpenses(await fetchExpenses());
        setSalesHistory(await fetchSalesHistory());
      }
    } catch (err: any) {
      Alert.alert('Sync issue', err?.message ?? 'Could not reach the server.');
    }
  };
  const refreshPendingCount = async () => setPendingCount((await getQueue()).length);
  const doSync = async () => {
    setSyncing(true);
    try {
      const { synced } = await flushQueue();
      await refreshPendingCount();
      if (synced > 0) await refresh();
    } finally {
      setSyncing(false);
    }
  };
  useEffect(() => {
    refresh();
    refreshPendingCount();
    const unsubscribeDevices = subscribeToDevices(() => { refresh(); });
    const unsubscribeNet = subscribeConnectivity((online) => { if (online) doSync(); });
    return () => { unsubscribeDevices(); unsubscribeNet(); };
  }, []);
  // Runs a mutation online, or queues it for later if there's no connection
  // (or the request fails partway through one) — the offline mode the PRD asks for.
  const runOrQueue = async (type: QueuedActionType, payload: any, label: string, run: () => Promise<void>): Promise<{ queued: boolean }> => {
    const online = await isOnline();
    if (!online) {
      await enqueue(type, payload, label);
      await refreshPendingCount();
      return { queued: true };
    }
    try {
      await run();
      return { queued: false };
    } catch (err: any) {
      const msg = String(err?.message ?? err).toLowerCase();
      if (msg.includes('network') || msg.includes('fetch')) {
        await enqueue(type, payload, label);
        await refreshPendingCount();
        return { queued: true };
      }
      throw err;
    }
  };
  const reset = () => setForm({ model: '', storage: '', imei: '', imei2: '', price: '', pta: 'PTA Approved', softwareStatus: 'OEM Unlocked', condition: '', ptaTax: '', title: '', amount: '', partId: '', sale: '', warrantyDays: 7, tradeIn: false, tiModel: '', tiStorage: '', tiImei: '', tiValue: '' });
  const openSheet = (s: typeof sheet) => { reset(); setSheet(s); };
  const saveDevice = async () => {
    if (!form.model.trim() || Number(form.price) <= 0 || !/^\d{15}$/.test(form.imei.trim()) || (!!form.imei2.trim() && !/^\d{15}$/.test(form.imei2.trim()))) { Alert.alert('Check device details', 'Enter a model, purchase price, and a 15-digit IMEI 1.'); return; }
    const payload = { model: form.model.trim(), storage: form.storage.trim() || undefined, imei: form.imei.trim(), imei2: form.imei2.trim() || undefined, pta: form.pta, purchasePrice: Number(form.price), softwareStatus: form.softwareStatus, conditionNotes: form.condition.trim() || undefined, ptaTax: Number(form.ptaTax) || 0 };
    try {
      const result = await runOrQueue('addDevice', payload, `Add ${form.model.trim()}`, async () => { await addDevice(payload); });
      setSheet(null);
      if (result.queued) { Alert.alert('Saved offline', "This device will be added automatically once you're back online."); setTab('Inventory'); }
      else { await refresh(); setTab('Inventory'); }
    } catch (err: any) { Alert.alert('Could not add device', err?.message ?? 'That IMEI may already be in use.'); }
  };
  const saveExpense = async () => {
    if (!form.title.trim() || Number(form.amount) <= 0) { Alert.alert('Check expense', 'Enter a description and amount greater than zero.'); return; }
    const payload = { title: form.title.trim(), amount: Number(form.amount) };
    try {
      const result = await runOrQueue('addExpense', payload, `Expense: ${form.title.trim()}`, async () => { await addExpense(payload); });
      setSheet(null);
      if (result.queued) Alert.alert('Saved offline', "This expense will sync once you're back online.");
      else await refresh();
      setTab('Activity');
    } catch (err: any) { Alert.alert('Could not save expense', err?.message ?? String(err)); }
  };
  const saveRepair = async () => {
    if (!active || !form.title.trim() || Number(form.amount) <= 0) { Alert.alert('Check repair', 'Enter a repair description and cost.'); return; }
    const payload = { deviceUuid: active.uuid, description: form.title.trim(), cost: Number(form.amount), partId: form.partId || undefined };
    try {
      const result = await runOrQueue('logRepair', payload, `Repair: ${form.title.trim()} on ${active.model}`, async () => { await logRepair(payload); });
      setSheet(null);
      if (result.queued) Alert.alert('Saved offline', "This repair will sync once you're back online.");
      else await refresh();
    } catch (err: any) { Alert.alert('Could not log repair', err?.message ?? String(err)); }
  };
  const saveSale = async () => {
    if (!active || Number(form.sale) <= 0) { Alert.alert('Check sale price', 'Enter a sale price greater than zero.'); return; }
    if (form.tradeIn) {
      if (!form.tiModel.trim() || !/^\d{15}$/.test(form.tiImei.trim()) || Number(form.tiValue) <= 0) { Alert.alert('Check trade-in details', "Enter the incoming device's model, a 15-digit IMEI, and an agreed value greater than zero."); return; }
      try {
        const result = await recordTradeIn({ outgoingDeviceUuid: active.uuid, outgoingSalePrice: Number(form.sale), incomingModel: form.tiModel.trim(), incomingStorage: form.tiStorage.trim() || undefined, incomingImei: form.tiImei.trim(), incomingValue: Number(form.tiValue), warrantyDays: form.warrantyDays });
        setSheet(null);
        await refresh();
        Alert.alert('Trade-in recorded', `Cash difference: ${money(result.cashDifference)}. The incoming ${form.tiModel.trim()} was added as ${result.incomingDeviceCode}.`);
      } catch (err: any) { Alert.alert('Could not record trade-in', err?.message ?? String(err)); }
      return;
    }
    const payload = { deviceUuid: active.uuid, salePrice: Number(form.sale), warrantyDays: form.warrantyDays };
    try {
      const result = await runOrQueue('recordSale', payload, `Sale: ${active.model}`, async () => { await recordSale(payload); });
      setSheet(null);
      if (result.queued) Alert.alert('Saved offline', "This sale will sync once you're back online.");
      else await refresh();
    } catch (err: any) { Alert.alert('Could not record sale', err?.message ?? String(err)); }
  };
  const checkVerification = async (slot: 1 | 2) => {
    if (!active) return;
    setCheckingVerif(true);
    try {
      await requestVerification(active.uuid, slot);
      setVerifChecks(await fetchVerificationChecks(active.uuid));
    } catch (err: any) {
      Alert.alert('Could not run check', err?.message ?? String(err));
    } finally {
      setCheckingVerif(false);
    }
  };
  useEffect(() => {
    if (!active) { setVerifChecks([]); return; }
    fetchVerificationChecks(active.uuid).then(setVerifChecks).catch(() => setVerifChecks([]));
  }, [active?.uuid]);
  const changeStatus = async (status: Status) => {
    if (!active) return;
    if (status !== 'Ready for sale') { await refresh(); return; }
    const payload = { deviceUuid: active.uuid };
    try {
      const result = await runOrQueue('markReadyForSale', payload, `Mark ${active.model} ready for sale`, async () => { await markReadyForSale(active.uuid); });
      if (result.queued) Alert.alert('Saved offline', "This update will sync once you're back online.");
      else await refresh();
    } catch (err: any) { Alert.alert('Could not update status', err?.message ?? String(err)); }
  };
  const handleScanned = (data: string) => {
    const finishedMode = scanner;
    setScanner(null);
    if (finishedMode === 'imei') {
      const digits = data.replace(/\D/g, '');
      setForm(f => ({ ...f, imei: digits.slice(0, 15) }));
      if (digits.length !== 15) Alert.alert('Check the number', 'That scan came back as ' + digits.length + ' digits — review and correct it before saving.');
    } else if (finishedMode === 'lookup') {
      const code = data.trim();
      const found = devices.find(d => d.id.toLowerCase() === code.toLowerCase());
      if (found) { setSelected(found.id); setTab('Inventory'); }
      else Alert.alert('Device not found', `No device matches the code "${code}".`);
    }
  };
  const pickAndUploadAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access to set a profile picture.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setAvatarUploading(true);
    try {
      const contentType = asset.mimeType || (asset.uri.endsWith('.png') ? 'image/png' : 'image/jpeg');
      const url = await uploadAvatar(profile.id, asset.uri, contentType);
      setAvatarUrl(url);
    } catch (err: any) {
      Alert.alert('Could not update photo', err?.message ?? String(err));
    } finally {
      setAvatarUploading(false);
    }
  };
  const saveName = async () => {
    if (!nameDraft.trim()) { Alert.alert('Enter a name', 'Full name cannot be empty.'); return; }
    try { await updateFullName(profile.id, nameDraft.trim()); Alert.alert('Saved', 'Your name has been updated.'); } catch (err: any) { Alert.alert('Could not save', err?.message ?? String(err)); }
  };
  const savePassword = async () => {
    if (newPassword.length < 6) { Alert.alert('Check your password', 'Use at least 6 characters.'); return; }
    try { await changePassword(newPassword); setNewPassword(''); Alert.alert('Password updated', 'Use your new password next time you sign in.'); } catch (err: any) { Alert.alert('Could not update password', err?.message ?? String(err)); }
  };
  const saveNewPart = async () => {
    if (!form.title.trim() || Number(form.amount) < 0) { Alert.alert('Check part details', 'Enter a part name and a valid unit cost.'); return; }
    try {
      await addPart({ name: form.title.trim(), unitCost: Number(form.amount) || 0, quantityInStock: Number(form.price) || 0 });
      setSheet(null);
      setParts(await fetchParts());
    } catch (err: any) { Alert.alert('Could not add part', err?.message ?? String(err)); }
  };
  const runExport = async () => {
    let filtered = devices;
    if (exportRange && exportRange !== 'custom') {
      const days = exportRange === '3d' ? 3 : exportRange === '7d' ? 7 : exportRange === '15d' ? 15 : 30;
      const cutoff = Date.now() - days * 86400000;
      filtered = devices.filter(d => new Date(d.date).getTime() >= cutoff);
    } else if (exportRange === 'custom' && exportFrom && exportTo) {
      const from = new Date(exportFrom).getTime();
      const to = new Date(exportTo).getTime() + 86400000;
      filtered = devices.filter(d => { const t = new Date(d.date).getTime(); return t >= from && t <= to; });
    }
    try {
      await exportInventoryCsv(filtered);
      setSheet(null);
    } catch (err: any) { Alert.alert('Could not export', err?.message ?? String(err)); }
  };
  const toggleDiagnosticPersisted = async (item: string, current: boolean) => {
    if (!active) return;
    const next = !current;
    setDiagnostics2(prev => { const others = prev.filter(d => d.item !== item); return [...others, { item, passed: next, checkedAt: new Date().toISOString() }]; });
    try { await saveDiagnosticResult(active.uuid, item, next); } catch (err: any) { Alert.alert('Could not save', err?.message ?? String(err)); }
  };
  useEffect(() => {
    if (!active) { setDeviceHistory([]); setDiagnostics2([]); return; }
    fetchDeviceHistory(active.uuid).then(setDeviceHistory).catch(() => setDeviceHistory([]));
    fetchDiagnostics(active.uuid).then(setDiagnostics2).catch(() => setDiagnostics2([]));
  }, [active?.uuid]);
  useEffect(() => {
    fetchParts().then(setParts).catch(() => {});
    if (profile.role === 'owner') fetchActiveWarranties().then(setActiveWarranties).catch(() => {});
  }, []);
  const nav = (next: Tab) => { if (next === 'Add') { setSelected(null); openSheet('device'); } else { setSelected(null); setTab(next); } };
  const syncBanner = pendingCount > 0 ? <Pressable onPress={doSync} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF3E6', borderRadius: 14, padding: 14, marginBottom: 18 }}><I name={syncing ? 'sync-outline' : 'cloud-offline-outline'} color="#BC7726" size={20}/><Text style={{ flex: 1, color: '#8A5A1C', fontSize: 12, fontWeight: '700' }}>{pendingCount} change{pendingCount > 1 ? 's' : ''} waiting to sync{syncing ? ' · syncing…' : ' · tap to retry'}</Text></Pressable> : null;
  const header = <View style={styles.topbar}><View style={styles.brand}><View style={styles.brandIcon}><I name="swap-horizontal" size={19} color="#fff" /></View><Text style={styles.brandName}>flipwise<Text style={{ color: purple }}>.</Text></Text></View><View style={styles.headerRight}><View style={styles.roleTag}><View style={styles.onlineDot}/><Text style={styles.roleText}>{role}</Text></View><Pressable onPress={() => nav('More')} accessibilityLabel="Open settings" style={[styles.avatar, { overflow: 'hidden' }]}>{avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: 33, height: 33 }}/> : <Text style={{ color: purple, fontWeight: '800' }}>{(profile.fullName ?? 'You').slice(0, 2).toUpperCase()}</Text>}</Pressable></View></View>;
  const home = <><View style={styles.welcome}><View><Text style={styles.overline}>YOUR BUSINESS, AT A GLANCE</Text><Text style={styles.greeting}>Good morning, {(profile.fullName ?? 'there').split(' ')[0]} <Text style={{ color: '#E2AC48' }}>✦</Text></Text><Text style={styles.subtitle}>Here's what's happening with your phones today.</Text></View><Pressable onPress={() => openSheet('device')} style={styles.primaryCircle}><I name="add" size={25} color="#fff" /></Pressable></View>{syncBanner}{role === 'Owner' && <><View style={styles.heroCard}><View style={styles.heroGlow}/><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}><View><Text style={styles.heroLabel}>NET PROFIT  ·  ALL TIME</Text><Text style={styles.heroAmount}>{money(stats?.net_profit ?? 0)}</Text><Text style={styles.heroFoot}>From {sold.length} sold devices · after business expenses</Text></View><View style={styles.heroArrow}><I name="trending-up" color="#fff" size={19}/></View></View><View style={styles.heroDivider}/><View style={styles.heroBottom}><View><Text style={styles.heroBottomLabel}>SALES REVENUE</Text><Text style={styles.heroBottomValue}>{money(stats?.sales_revenue ?? 0)}</Text></View><View><Text style={styles.heroBottomLabel}>UNSOLD CAPITAL</Text><Text style={styles.heroBottomValue}>{money(stats?.unsold_capital ?? 0)}</Text></View></View></View><View style={styles.statRow}><Stat icon="phone-portrait-outline" label="In stock" value={String(unsold.length)} sub="Active devices"/><Stat icon="construct-outline" label="In repair" value={String(devices.filter(d => d.status === 'In repair').length)} sub="Need attention" tone="orange"/><Stat icon="checkmark-circle-outline" label="Ready to sell" value={String(devices.filter(d => d.status === 'Ready for sale').length)} sub="Available now" tone="green"/></View>{activeWarranties.length > 0 && <><Section title="Active warranties"/><View style={styles.cardList}>{activeWarranties.slice(0, 4).map((w, i) => <View key={w.deviceId} style={[styles.activityRow, i === Math.min(activeWarranties.length, 4) - 1 && { borderBottomWidth: 0 }]}><View style={styles.activityIcon}><I name="shield-checkmark-outline" color={purple} size={19}/></View><View style={{ flex: 1 }}><Text style={styles.deviceName}>{w.model}</Text><Text style={[styles.meta, { marginTop: 4 }]}>{w.deviceCode} · {w.warrantyDays}-day warranty</Text></View><Text style={{ fontWeight: '800', fontSize: 12, color: w.daysRemaining <= 1 ? '#C4423B' : ink }}>{w.daysRemaining === 0 ? 'Expires today' : `${w.daysRemaining}d left`}</Text></View>)}</View></>}</>}{role === 'Technician' && <View style={styles.statRow}><Stat icon="phone-portrait-outline" label="In stock" value={String(unsold.length)}/><Stat icon="construct-outline" label="In repair" value={String(devices.filter(d => d.status === 'In repair').length)} tone="orange"/><Stat icon="checkmark-circle-outline" label="Ready" value={String(devices.filter(d => d.status === 'Ready for sale').length)} tone="green"/></View>}<Section title="Quick actions"/><View style={styles.actionRow}>{([{ icon: 'add-circle-outline', label: 'Add phone', action: () => openSheet('device') }, { icon: 'receipt-outline', label: 'Log expense', action: () => openSheet('expense') }, { icon: 'search-outline', label: 'Find device', action: () => nav('Inventory') }] as {icon: Icon; label: string; action: () => void}[]).map(a => <Pressable key={a.label} style={styles.quickAction} onPress={a.action}><View style={styles.quickIcon}><I name={a.icon} color={purple} size={22}/></View><Text style={styles.quickText}>{a.label}</Text></Pressable>)}</View><Section title="Recent devices" action="View all" onPress={() => nav('Inventory')}/><View style={styles.cardList}>{devices.slice(0, 3).map(d => <DeviceCard key={d.id} device={d} onPress={() => { setSelected(d.id); setTab('Inventory'); }}/>)}</View><View style={styles.tip}><I name="sparkles-outline" color={purple} size={20}/><View style={{ flex: 1 }}><Text style={styles.tipTitle}>Stay on top of your stock</Text><Text style={styles.tipBody}>Track purchases, repairs and sales in one simple place.</Text></View></View></>;
  const inventory = active ? <><Pressable onPress={() => setSelected(null)} style={styles.back}><I name="arrow-back" size={18} color={purple}/><Text style={styles.link}>All inventory</Text></Pressable><View style={styles.detailHero}><View style={[styles.largePhoneArt, { backgroundColor: active.tint }]}><View style={[styles.phoneShape, { width: 58, height: 99, borderRadius: 12 }]}><View style={styles.lensRow}><View style={styles.lens}/><View style={styles.lens}/></View></View></View><View style={{ flex: 1 }}><Text style={styles.overline}>{active.id}</Text><Text style={styles.detailTitle}>{active.model}</Text><Text style={styles.meta}>{active.storage} · {active.pta}</Text><View style={{ alignSelf: 'flex-start', marginTop: 12 }}><Pill text={active.status} bg={statusColors[active.status][0]} color={statusColors[active.status][1]}/></View></View></View><Section title="Device details"/><View style={styles.infoCard}>{([['IMEI 1', active.imei], ...(active.imei2 ? [['IMEI 2', active.imei2] as const] : []), ['Storage', active.storage], ['PTA status', active.pta], ['Acquired', active.date]] as const).map(([k,v]) => <View key={k} style={styles.infoRow}><Text style={styles.infoKey}>{k}</Text><Text style={styles.infoValue}>{v}</Text></View>)}</View><Section title="IMEI/PTA verification"/><View style={styles.infoCard}>{([1, 2] as const).filter(slot => slot === 1 || !!active.imei2).map((slot, i, arr) => { const imeiVal = slot === 1 ? active.imei : active.imei2!; const latest = verifChecks.find(c => c.imeiSlot === slot); return <View key={slot} style={[styles.infoRow, { flexDirection: 'column', alignItems: 'stretch', gap: 4 }, i === arr.length - 1 && { borderBottomWidth: 0 }]}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={styles.infoKey}>IMEI {slot} · {imeiVal}</Text><Pressable onPress={() => checkVerification(slot)} disabled={checkingVerif}><Text style={{ color: purple, fontWeight: '700', fontSize: 12 }}>{checkingVerif ? 'Checking…' : 'Check now'}</Text></Pressable></View><Text style={{ fontSize: 11, color: latest?.status === 'verified' ? '#25865B' : muted }}>{latest ? `${latest.status === 'verified' ? '✅ Verified' : latest.status === 'unavailable' ? 'No verification provider connected' : latest.status} · ${new Date(latest.checkedAt).toLocaleString()}` : 'Not checked yet'}</Text></View>; })}</View><Section title="Diagnostics"/><View style={styles.infoCard}>{(active.model.toLowerCase().includes('pixel') ? ['Display & burn-in', 'Battery cycles', 'Fingerprint / UDFPS', 'Charging & ports', 'Cameras & audio'] : ['Display & touch', 'Battery health', 'Face / fingerprint unlock', 'Charging & ports', 'Cameras & audio']).map(item => { const rec = diagnostics2.find(d => d.item === item); const checked = !!rec?.passed; return <Pressable key={item} onPress={() => toggleDiagnosticPersisted(item, checked)} accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.infoRow}><Text style={styles.infoKey}>{item}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text style={[styles.infoValue, { color: checked ? '#25865B' : muted }]}>{checked ? 'Checked' : 'Not checked'}</Text><I name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={checked ? '#25865B' : '#B5B1C1'}/></View></Pressable>; })}</View>{deviceHistory.length > 0 && <><Section title="History"/><View style={styles.infoCard}>{deviceHistory.map((h, i) => <View key={h.id} style={[styles.infoRow, i === deviceHistory.length - 1 && { borderBottomWidth: 0 }]}><Text style={styles.infoKey}>{h.fieldName === 'status' ? `${h.oldValue} → ${h.newValue}` : `${h.fieldName.replace('_', ' ')} changed`}</Text><Text style={styles.infoValue}>{new Date(h.changedAt).toLocaleDateString()}</Text></View>)}</View></>}<Section title="Cost breakdown"/><View style={styles.infoCard}>{([['Purchase price', money(active.cost)], ['Repairs & parts', money(active.repair)], ['PTA tax', money(active.tax)], ['Total invested', money(active.cost + active.repair + active.tax)]] as const).map(([k,v], i) => <View key={k} style={[styles.infoRow, i === 3 && { borderBottomWidth: 0 }]}><Text style={[styles.infoKey, i === 3 && { color: ink, fontWeight: '800' }]}>{k}</Text><Text style={[styles.infoValue, i === 3 && { color: purple, fontWeight: '800' }]}>{v}</Text></View>)}{active.sale != null && <View style={styles.profitBand}><Text style={{ color: '#4D3AA5', fontWeight: '700' }}>Profit on sale</Text><Text style={{ color: purple, fontWeight: '900', fontSize: 19 }}>{money(active.sale - active.cost - active.repair - active.tax)}</Text></View>}</View><Section title="Device label"/><View style={[styles.infoCard, { alignItems: 'center', paddingVertical: 22 }]}><QRCode value={active.id} size={132} color={ink} backgroundColor="#fff"/><Text style={[styles.meta, { marginTop: 14, textAlign: 'center' }]}>Print this on a label. Scanning it from Inventory opens this device instantly.</Text></View><Section title="Update this device"/><View style={styles.detailActions}><Button title="Log repair" icon="construct-outline" secondary onPress={() => openSheet('repair')}/><Button title="Ready to sell" icon="checkmark-outline" secondary onPress={() => changeStatus('Ready for sale')}/>{role === 'Owner' && active.status !== 'Sold' && <Button title="Record sale" icon="bag-check-outline" onPress={() => openSheet('sale')}/>}<Button title={active.status === 'Sold' ? 'Share receipt' : 'Share device summary'} icon="share-outline" secondary onPress={() => shareDeviceReceipt(active).catch((err: any) => Alert.alert('Could not share', err?.message ?? String(err)))}/>{active.status !== 'Sold' && <Button title="Share listing on WhatsApp" icon="logo-whatsapp" secondary onPress={() => shareListingViaWhatsApp(buildMarketplaceListing(active)).catch((err: any) => Alert.alert('Could not open WhatsApp', err?.message ?? String(err)))}/>}</View><Text style={styles.disclaimer}>Diagnostics are manually recorded, not automated hardware tests. IMEI/PTA verification logs each check honestly — no provider is connected yet, so results show as unavailable rather than a fake pass.</Text></> : <><View style={styles.pageHeading}><View><Text style={styles.overline}>YOUR STOCKROOM</Text><Text style={styles.pageTitle}>Inventory</Text><Text style={styles.subtitle}>{devices.length} devices across your business</Text></View><Pressable onPress={() => openSheet('device')} style={styles.primaryCircle}><I name="add" size={25} color="#fff"/></Pressable></View><View style={{ flexDirection: 'row', gap: 9 }}><View style={[styles.searchBox, { flex: 1, marginBottom: 0 }]}><I name="search-outline" size={20} color={muted}/><TextInput style={{ flex: 1, color: ink, fontSize: 14 }} value={query} onChangeText={setQuery} placeholder="Search model, IMEI or ID" placeholderTextColor="#ABA7B7" accessibilityLabel="Search inventory"/>{query.length > 0 && <Pressable onPress={() => setQuery('')}><I name="close-circle" size={18} color={muted}/></Pressable>}</View><Pressable onPress={() => setScanner('lookup')} accessibilityLabel="Scan a device QR label" style={{ width: 48, height: 48, borderRadius: 13, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}><I name="qr-code-outline" size={20} color={purple}/></Pressable></View><View style={{ height: 16 }}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{['All', 'Purchased', 'In repair', 'Ready for sale', 'Sold'].map(f => <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filter, filter === f && styles.activeFilter]}><Text style={[styles.filterText, filter === f && { color: '#fff' }]}>{f}</Text></Pressable>)}</ScrollView><View style={styles.inventoryCaption}><Text style={styles.sectionTitle}>{filter === 'All' ? 'All devices' : filter}</Text><Text style={styles.meta}>{visible.length} results</Text></View>{visible.length ? <View style={styles.cardList}>{visible.map(d => <DeviceCard key={d.id} device={d} onPress={() => setSelected(d.id)}/>)}</View> : <Empty icon="search-outline" title="No devices found" subtitle="Try another search or add your first phone."/>}</>;
  const activity = <><View style={styles.pageHeading}><View><Text style={styles.overline}>EVERY MOVE, RECORDED</Text><Text style={styles.pageTitle}>Activity</Text><Text style={styles.subtitle}>An easy view of what is happening.</Text></View></View><Section title="Recent events"/><View style={styles.cardList}>{[...devices.map(d => ({ id: d.id, title: d.status === 'Sold' ? `${d.model} sold` : `${d.model} · ${d.status.toLowerCase()}`, sub: `${d.id} · ${d.date}`, icon: d.status === 'Sold' ? 'bag-check-outline' as Icon : 'phone-portrait-outline' as Icon, amount: d.status === 'Sold' ? money(d.sale || 0) : '' })), ...expenses.map(e => ({ id: e.id, title: e.title, sub: `${e.category} · ${e.date}`, icon: 'receipt-outline' as Icon, amount: `−${money(e.amount)}` }))].map(item => <View key={item.id} style={styles.activityRow}><View style={styles.activityIcon}><I name={item.icon} color={purple} size={19}/></View><View style={{ flex: 1 }}><Text style={styles.deviceName}>{item.title}</Text><Text style={[styles.meta, { marginTop: 4 }]}>{item.sub}</Text></View><Text style={{ fontWeight: '800', fontSize: 12, color: item.amount.startsWith('−') ? '#C4813B' : ink }}>{item.amount}</Text></View>)}</View></>;
  const daysSince = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  const aged15 = unsold.filter(d => daysSince(d.date) >= 15 && daysSince(d.date) < 30);
  const aged30 = unsold.filter(d => daysSince(d.date) >= 30 && daysSince(d.date) < 60);
  const aged60 = unsold.filter(d => daysSince(d.date) >= 60);
  const monthlyTrend = (() => {
    const map = new Map<string, number>();
    for (const s of salesHistory) map.set(s.saleDate.slice(0, 7), (map.get(s.saleDate.slice(0, 7)) ?? 0) + s.profit);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  })();
  const more = <><View style={styles.pageHeading}><View><Text style={styles.overline}>YOUR WORKSPACE</Text><Text style={styles.pageTitle}>More</Text><Text style={styles.subtitle}>A calmer way to run your phone business.</Text></View></View><Pressable onPress={pickAndUploadAvatar} style={styles.profileCard}><View style={[styles.avatar, { width: 56, height: 56, borderRadius: 18, overflow: 'hidden' }]}>{avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: 56, height: 56 }}/> : <Text style={{ color: purple, fontWeight: '900', fontSize: 16 }}>{(profile.fullName ?? 'You').slice(0, 2).toUpperCase()}</Text>}</View><View style={{ flex: 1 }}><Text style={styles.deviceName}>{profile.fullName ?? 'Your account'}</Text><Text style={styles.meta}>{role === 'Owner' ? 'Workspace owner' : 'Technician'} · Synced to Supabase</Text><Text style={{ color: purple, fontSize: 11, fontWeight: '700', marginTop: 5 }}>{avatarUploading ? 'Uploading…' : 'Tap to change photo'}</Text></View></Pressable><Section title="Edit profile"/><View style={styles.infoCard}><Text style={styles.fieldLabel}>Full name</Text><View style={{ flexDirection: 'row', gap: 8, marginBottom: 17 }}><TextInput style={[styles.input, { flex: 1 }]} value={nameDraft} onChangeText={setNameDraft} placeholder="Your name" placeholderTextColor="#B5B1C1"/><Pressable onPress={saveName} style={{ backgroundColor: purple, borderRadius: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Save</Text></Pressable></View><Text style={styles.fieldLabel}>New password</Text><View style={{ flexDirection: 'row', gap: 8 }}><TextInput style={[styles.input, { flex: 1 }]} value={newPassword} onChangeText={setNewPassword} placeholder="At least 6 characters" placeholderTextColor="#B5B1C1" secureTextEntry/><Pressable onPress={savePassword} style={{ backgroundColor: purple, borderRadius: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Update</Text></Pressable></View></View><Section title="Account"/><View style={styles.infoCard}><View style={styles.infoRow}><Text style={styles.infoKey}>Role</Text><Text style={styles.infoValue}>{role}</Text></View><View style={[styles.infoRow, { borderBottomWidth: 0 }]}><Text style={styles.infoKey}>Permissions</Text><Text style={styles.infoValue}>{role === 'Owner' ? 'Full access + P&L' : 'Stock & repairs only'}</Text></View></View><Button title="Sign out" icon="log-out-outline" secondary onPress={onSignOut}/><Section title="Parts ledger" action={role === 'Owner' ? 'Add part' : undefined} onPress={role === 'Owner' ? () => openSheet('part') : undefined}/><View style={styles.infoCard}>{parts.length === 0 ? <View style={[styles.infoRow, { borderBottomWidth: 0 }]}><Text style={styles.meta}>No parts yet. Add screens, batteries and other bulk-bought stock here.</Text></View> : parts.map((p, i) => <View key={p.id} style={[styles.infoRow, i === parts.length - 1 && { borderBottomWidth: 0 }]}><Text style={styles.infoKey}>{p.name}</Text><Text style={[styles.infoValue, p.quantityInStock === 0 && { color: '#C4423B' }]}>{p.quantityInStock} in stock · {money(p.unitCost)}</Text></View>)}</View>{role === 'Owner' && <><Section title="Aged inventory"/><View style={styles.infoCard}><View style={styles.infoRow}><Text style={styles.infoKey}>15–29 days unsold</Text><Text style={styles.infoValue}>{aged15.length} device{aged15.length === 1 ? '' : 's'}</Text></View><View style={styles.infoRow}><Text style={styles.infoKey}>30–59 days unsold</Text><Text style={[styles.infoValue, aged30.length > 0 && { color: '#BC7726' }]}>{aged30.length} device{aged30.length === 1 ? '' : 's'}</Text></View><View style={[styles.infoRow, { borderBottomWidth: 0 }]}><Text style={styles.infoKey}>60+ days unsold</Text><Text style={[styles.infoValue, aged60.length > 0 && { color: '#C4423B' }]}>{aged60.length} device{aged60.length === 1 ? '' : 's'}</Text></View></View><Section title="Monthly net profit"/><View style={styles.infoCard}>{monthlyTrend.length === 0 ? <View style={[styles.infoRow, { borderBottomWidth: 0 }]}><Text style={styles.meta}>No sales recorded yet.</Text></View> : monthlyTrend.map(([m, profit], i) => <View key={m} style={[styles.infoRow, i === monthlyTrend.length - 1 && { borderBottomWidth: 0 }]}><Text style={styles.infoKey}>{new Date(m + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text><Text style={[styles.infoValue, { color: profit >= 0 ? '#25865B' : '#C4423B' }]}>{money(profit)}</Text></View>)}</View><Section title="Exports"/><View style={styles.infoCard}><Pressable onPress={() => { setExportRange(null); setExportFrom(''); setExportTo(''); openSheet('export'); }} style={[styles.settingRow, { borderBottomWidth: 0 }]}><I name="download-outline" size={20} color={purple}/><View><Text style={styles.deviceName}>Export inventory (CSV)</Text><Text style={styles.meta}>Choose a date range, then export cost, sale price and profit</Text></View></Pressable></View></>}<Section title="Coming next"/><View style={styles.infoCard}>{([{ icon: 'shield-checkmark-outline' as Icon, title: 'Live IMEI/PTA providers', desc: 'Connecting real PTA DVS, Apple GSX and IMEI.info credentials — checks currently log as unavailable, never a fake pass' }] as const).map((x, i) => <View key={x.title} style={[styles.settingRow, i === 0 && { borderBottomWidth: 0 }]}><I name={x.icon} size={20} color={purple}/><View><Text style={styles.deviceName}>{x.title}</Text><Text style={styles.meta}>{x.desc}</Text></View></View>)}</View><Text style={styles.disclaimer}>Flipwise is connected to your Supabase project. Photos (before/after condition, thermal labels) and purchase-agreement/repair-quote documents aren't built yet.</Text></>;
  const content = tab === 'Home' ? home : tab === 'Inventory' ? inventory : tab === 'Activity' ? activity : more;
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FBFAFE' }} edges={['top', 'bottom']}><StatusBar barStyle="dark-content" backgroundColor="#FBFAFE"/><View style={[styles.shell, desktop && { flexDirection: 'row' }]}>{desktop && <View style={styles.sidebar}><View style={{ marginBottom: 32 }}>{header}</View>{(['Home', 'Inventory', 'Activity', 'More'] as Tab[]).map(t => <Pressable key={t} onPress={() => nav(t)} style={[styles.sideItem, tab === t && styles.sideActive]}><I name={({ Home: 'grid-outline', Inventory: 'phone-portrait-outline', Activity: 'time-outline', More: 'settings-outline' } as Record<string, Icon>)[t]} color={tab === t ? purple : muted}/><Text style={[styles.sideLabel, tab === t && { color: purple }]}>{t}</Text></Pressable>)}<View style={{ marginTop: 30 }}><Button title="Add a phone" icon="add" onPress={() => openSheet('device')}/></View></View>}<View style={{ flex: 1 }}>{!desktop && header}<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, desktop && { maxWidth: 940, width: '100%', alignSelf: 'center', paddingTop: 44 }]}>{content}</ScrollView>{!desktop && <View style={styles.bottomNav}>{([{ tab: 'Home', icon: 'grid-outline' }, { tab: 'Inventory', icon: 'phone-portrait-outline' }, { tab: 'Add', icon: 'add' }, { tab: 'Activity', icon: 'time-outline' }, { tab: 'More', icon: 'ellipsis-horizontal' }] as {tab: Tab; icon: Icon}[]).map(item => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === item.tab }} key={item.tab} onPress={() => nav(item.tab)} style={styles.navItem}>{item.tab === 'Add' ? <View style={styles.navAdd}><I name="add" color="#fff" size={25}/></View> : <I name={item.icon} color={tab === item.tab ? purple : '#A5A1B2'} size={22}/>}<Text style={[styles.navText, tab === item.tab && { color: purple }]}>{item.tab}</Text></Pressable>)}</View>}</View></View><Modal visible={sheet !== null} animationType="slide" transparent onRequestClose={() => setSheet(null)}><View style={styles.modalOverlay}><Pressable style={{ flex: 1 }} onPress={() => setSheet(null)}/><View style={[styles.sheet, desktop && { alignSelf: 'center', width: 520, borderRadius: 24 }]}><View style={styles.sheetHandle}/><View style={styles.sheetHeading}><View><Text style={styles.overline}>QUICK ENTRY</Text><Text style={styles.sheetTitle}>{sheet === 'device' ? 'Add a phone' : sheet === 'expense' ? 'Log an expense' : sheet === 'repair' ? 'Log a repair' : sheet === 'part' ? 'Add a part' : sheet === 'export' ? 'Export inventory' : 'Record a sale'}</Text></View><Pressable onPress={() => setSheet(null)} style={styles.close}><I name="close" size={21}/></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }} contentContainerStyle={{ paddingBottom: 8 }}>{sheet === 'device' && <><Field label="Device model *" value={form.model} onChangeText={v => setForm({ ...form, model: v })} placeholder="e.g. iPhone 14 Pro"/><Field label="Storage" value={form.storage} onChangeText={v => setForm({ ...form, storage: v })} placeholder="e.g. 256 GB"/><View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9 }}><View style={{ flex: 1 }}><Field label="IMEI 1 · 15 digits *" value={form.imei} onChangeText={v => setForm({ ...form, imei: v })} keyboardType="numeric" placeholder="Enter IMEI number"/></View><Pressable onPress={() => setScanner('imei')} accessibilityLabel="Scan IMEI barcode" style={{ width: 45, height: 45, borderRadius: 11, backgroundColor: '#F2EEFD', alignItems: 'center', justifyContent: 'center', marginBottom: 17 }}><I name="camera-outline" color={purple} size={20}/></Pressable></View><Field label="IMEI 2 · optional" value={form.imei2} onChangeText={v => setForm({ ...form, imei2: v })} keyboardType="numeric" placeholder="For dual SIM devices"/><Text style={styles.fieldLabel}>PTA status</Text><View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 17 }}>{['PTA Approved', 'Non-PTA', 'JV / Carrier Locked'].map(p => <Pressable key={p} onPress={() => setForm({ ...form, pta: p })} style={[styles.filter, form.pta === p && styles.activeFilter]}><Text style={[styles.filterText, form.pta === p && { color: '#fff' }]}>{p}</Text></Pressable>)}</View><Field label="Purchase price (PKR) *" value={form.price} onChangeText={v => setForm({ ...form, price: v })} keyboardType="numeric" placeholder="e.g. 145000"/><Field label="PTA tax paid (PKR) · optional" value={form.ptaTax} onChangeText={v => setForm({ ...form, ptaTax: v })} keyboardType="numeric" placeholder="e.g. 5500"/><Text style={styles.fieldLabel}>Software status</Text><View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 17 }}>{['OEM Unlocked', 'Bootloader Locked', 'Factory Image Flashed'].map(s => <Pressable key={s} onPress={() => setForm({ ...form, softwareStatus: s })} style={[styles.filter, form.softwareStatus === s && styles.activeFilter]}><Text style={[styles.filterText, form.softwareStatus === s && { color: '#fff' }]}>{s}</Text></Pressable>)}</View><Field label="Condition notes · optional" value={form.condition} onChangeText={v => setForm({ ...form, condition: v })} placeholder="e.g. Minor scratches on frame"/></>}{(sheet === 'expense' || sheet === 'repair') && <><Field label={sheet === 'repair' ? 'Repair or part *' : 'What was this expense for? *'} value={form.title} onChangeText={v => setForm({ ...form, title: v })} placeholder={sheet === 'repair' ? 'e.g. Screen replacement' : 'e.g. Courier delivery'}/><Field label="Amount (PKR) *" value={form.amount} onChangeText={v => setForm({ ...form, amount: v })} keyboardType="numeric" placeholder="Enter amount"/>{sheet === 'repair' && parts.length > 0 && <><Text style={styles.fieldLabel}>Deduct a part from stock · optional</Text><View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 17 }}><Pressable onPress={() => setForm({ ...form, partId: '' })} style={[styles.filter, form.partId === '' && styles.activeFilter]}><Text style={[styles.filterText, form.partId === '' && { color: '#fff' }]}>None</Text></Pressable>{parts.map(p => <Pressable key={p.id} disabled={p.quantityInStock <= 0} onPress={() => setForm({ ...form, partId: p.id })} style={[styles.filter, form.partId === p.id && styles.activeFilter, p.quantityInStock <= 0 && { opacity: 0.4 }]}><Text style={[styles.filterText, form.partId === p.id && { color: '#fff' }]}>{p.name} ({p.quantityInStock} left)</Text></Pressable>)}</View></>}</>}{sheet === 'part' && <><Field label="Part name *" value={form.title} onChangeText={v => setForm({ ...form, title: v })} placeholder="e.g. OLED screen assembly"/><Field label="Unit cost (PKR) *" value={form.amount} onChangeText={v => setForm({ ...form, amount: v })} keyboardType="numeric" placeholder="e.g. 12000"/><Field label="Quantity in stock *" value={form.price} onChangeText={v => setForm({ ...form, price: v })} keyboardType="numeric" placeholder="e.g. 6"/></>}{sheet === 'export' && <><Text style={[styles.meta, { marginBottom: 14 }]}>Choose which devices (by acquisition date) to include in the CSV.</Text><View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 17 }}>{([['3d', 'Last 3 days'], ['7d', 'Last 7 days'], ['15d', 'Last 15 days'], ['1m', 'Last month'], ['custom', 'Custom'], [null, 'All time']] as const).map(([val, label]) => <Pressable key={label} onPress={() => setExportRange(val as any)} style={[styles.filter, exportRange === val && styles.activeFilter]}><Text style={[styles.filterText, exportRange === val && { color: '#fff' }]}>{label}</Text></Pressable>)}</View>{exportRange === 'custom' && <><Field label="From (YYYY-MM-DD) *" value={exportFrom} onChangeText={setExportFrom} placeholder="2026-09-01"/><Field label="To (YYYY-MM-DD) *" value={exportTo} onChangeText={setExportTo} placeholder="2026-09-28"/></>}</>}{sheet === 'sale' && <><Text style={[styles.meta, { marginBottom: 20 }]}>Selling {active?.model}. Total invested: {money((active?.cost || 0) + (active?.repair || 0) + (active?.tax || 0))}</Text><Field label="Final sale price (PKR) *" value={form.sale} onChangeText={v => setForm({ ...form, sale: v })} keyboardType="numeric" placeholder="Enter final price"/><Text style={styles.fieldLabel}>Checking warranty</Text><View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 17 }}>{([3, 7] as const).map(d => <Pressable key={d} onPress={() => setForm({ ...form, warrantyDays: d })} style={[styles.filter, form.warrantyDays === d && styles.activeFilter]}><Text style={[styles.filterText, form.warrantyDays === d && { color: '#fff' }]}>{d} days</Text></Pressable>)}</View>{Number(form.sale) > 0 && !form.tradeIn && <View style={styles.profitBand}><Text>Estimated device profit</Text><Text style={{ fontWeight: '800', color: purple }}>{money(Number(form.sale) - (active?.cost || 0) - (active?.repair || 0) - (active?.tax || 0))}</Text></View>}<Pressable onPress={() => setForm({ ...form, tradeIn: !form.tradeIn })} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 4, marginBottom: form.tradeIn ? 17 : 4 }}><I name={form.tradeIn ? 'checkbox' : 'square-outline'} size={20} color={purple}/><Text style={{ color: ink, fontWeight: '700', fontSize: 13 }}>This is a trade-in</Text></Pressable>{form.tradeIn && <><Field label="Incoming device model *" value={form.tiModel} onChangeText={v => setForm({ ...form, tiModel: v })} placeholder="e.g. Samsung Galaxy S23"/><Field label="Incoming device storage" value={form.tiStorage} onChangeText={v => setForm({ ...form, tiStorage: v })} placeholder="e.g. 128 GB"/><Field label="Incoming IMEI · 15 digits *" value={form.tiImei} onChangeText={v => setForm({ ...form, tiImei: v })} keyboardType="numeric" placeholder="Enter IMEI number"/><Field label="Agreed trade-in value (PKR) *" value={form.tiValue} onChangeText={v => setForm({ ...form, tiValue: v })} keyboardType="numeric" placeholder="e.g. 60000"/>{Number(form.sale) > 0 && Number(form.tiValue) > 0 && <View style={styles.profitBand}><Text>Cash difference to collect</Text><Text style={{ fontWeight: '800', color: purple }}>{money(Number(form.sale) - Number(form.tiValue))}</Text></View>}</>}</>}</ScrollView><Button title={sheet === 'device' ? 'Add to inventory' : sheet === 'expense' ? 'Save expense' : sheet === 'repair' ? 'Save repair' : sheet === 'part' ? 'Add part' : sheet === 'export' ? 'Export CSV' : form.tradeIn ? 'Confirm trade-in' : 'Confirm sale'} icon="checkmark" onPress={sheet === 'device' ? saveDevice : sheet === 'expense' ? saveExpense : sheet === 'repair' ? saveRepair : sheet === 'part' ? saveNewPart : sheet === 'export' ? runExport : saveSale}/></View></View></Modal><Modal visible={scanner !== null} animationType="slide" onRequestClose={() => setScanner(null)}>{scanner && <Scanner mode={scanner} onScanned={handleScanned} onClose={() => setScanner(null)}/>}</Modal></SafeAreaView>;
}
function Root() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);
  const loadProfile = async (userId: string) => {
    try { setProfile(await fetchProfile(userId)); } catch (err: any) { Alert.alert('Could not load your profile', err?.message ?? String(err)); }
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) loadProfile(next.user.id); else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  if (checking) return <SafeAreaView style={{ flex: 1, backgroundColor: '#FBFAFE', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: muted }}>Loading…</Text></SafeAreaView>;
  if (!session) return <SignIn/>;
  if (!profile) return <SafeAreaView style={{ flex: 1, backgroundColor: '#FBFAFE', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: muted }}>Setting up your workspace…</Text></SafeAreaView>;
  return <AppContent profile={profile} onSignOut={() => apiSignOut()}/>;
}
export default function App() { return <SafeAreaProvider><Root/></SafeAreaProvider>; }
const styles = StyleSheet.create({
  shell: { flex: 1 }, content: { paddingHorizontal: 21, paddingTop: 23, paddingBottom: 45 }, topbar: { height: 66, paddingHorizontal: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: border }, brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: purple, alignItems: 'center', justifyContent: 'center' }, brandName: { color: ink, fontSize: 20, fontWeight: '900', letterSpacing: -1 }, headerRight: { flexDirection: 'row', alignItems: 'center', gap: 13 }, roleTag: { flexDirection: 'row', alignItems: 'center', gap: 7 }, onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#55B78E' }, roleText: { color: muted, fontSize: 11, fontWeight: '700' }, avatar: { width: 33, height: 33, borderRadius: 11, backgroundColor: '#EDE8FB', alignItems: 'center', justifyContent: 'center' }, sidebar: { width: 250, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: border, padding: 17 }, sideItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 12, marginBottom: 5 }, sideActive: { backgroundColor: '#F3EFFE' }, sideLabel: { fontSize: 14, fontWeight: '700', color: muted }, welcome: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 21 }, overline: { color: purple, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8 }, greeting: { color: ink, fontWeight: '800', fontSize: 25, letterSpacing: -.7 }, subtitle: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 6 }, primaryCircle: { width: 42, height: 42, borderRadius: 14, backgroundColor: purple, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }, heroCard: { backgroundColor: '#6945D9', borderRadius: 22, padding: 23, overflow: 'hidden', marginBottom: 15 }, heroGlow: { width: 190, height: 190, borderRadius: 95, backgroundColor: '#8668ED', position: 'absolute', top: -90, right: -30, opacity: .65 }, heroLabel: { fontSize: 10, fontWeight: '800', color: '#DED4FF', letterSpacing: 1 }, heroAmount: { color: '#fff', fontSize: 31, fontWeight: '900', letterSpacing: -.8, marginTop: 13 }, heroFoot: { color: '#DFD6FC', fontSize: 11, marginTop: 7 }, heroArrow: { backgroundColor: '#FFFFFF24', width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, heroDivider: { height: 1, backgroundColor: '#FFFFFF30', marginVertical: 21 }, heroBottom: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 20 }, heroBottomLabel: { color: '#D7CBFC', fontSize: 9, fontWeight: '800', letterSpacing: .7 }, heroBottomValue: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 5 }, statRow: { flexDirection: 'row', gap: 9, marginBottom: 28 }, stat: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: border, borderRadius: 17, padding: 13, minWidth: 0 }, statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 13 }, statLabel: { fontSize: 11, color: muted, fontWeight: '600' }, statValue: { fontSize: 21, fontWeight: '900', color: ink, marginTop: 4 }, statSub: { fontSize: 10, color: muted, marginTop: 3 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, marginTop: 2 }, sectionTitle: { color: ink, fontSize: 17, fontWeight: '800', letterSpacing: -.3 }, link: { color: purple, fontSize: 12, fontWeight: '800' }, actionRow: { flexDirection: 'row', gap: 9, marginBottom: 29 }, quickAction: { flex: 1, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: '#fff', alignItems: 'center', gap: 9 }, quickIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: '#F3EFFF', alignItems: 'center', justifyContent: 'center' }, quickText: { fontWeight: '700', fontSize: 11, color: ink }, cardList: { backgroundColor: '#fff', borderRadius: 17, borderColor: border, borderWidth: 1, overflow: 'hidden', marginBottom: 24 }, deviceCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: border }, phoneArt: { width: 54, height: 63, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, phoneShape: { width: 30, height: 49, borderRadius: 7, backgroundColor: '#716C85', padding: 5, borderWidth: 2, borderColor: '#9692A6' }, lensRow: { flexDirection: 'row', gap: 3 }, lens: { backgroundColor: '#D2D0DD', width: 6, height: 6, borderRadius: 3 }, deviceName: { color: ink, fontSize: 13, fontWeight: '800' }, meta: { color: muted, fontSize: 11 }, deviceId: { color: '#B1AEC0', fontSize: 10 }, pill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 }, tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, backgroundColor: '#F2EEFC', borderRadius: 16, padding: 16, marginTop: 2 }, tipTitle: { color: '#4C339E', fontWeight: '800', fontSize: 12 }, tipBody: { color: '#7E6EB0', fontSize: 11, lineHeight: 17, marginTop: 4 }, bottomNav: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: border, flexDirection: 'row', height: 66, alignItems: 'center', justifyContent: 'space-around' }, navItem: { alignItems: 'center', flex: 1, gap: 4 }, navText: { color: '#AAA6B5', fontSize: 10, fontWeight: '700' }, navAdd: { width: 39, height: 39, backgroundColor: purple, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: -11 }, pageHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }, pageTitle: { color: ink, fontSize: 27, fontWeight: '900', letterSpacing: -.8 }, searchBox: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 13, borderWidth: 1, borderColor: border, paddingHorizontal: 15, backgroundColor: '#fff', marginBottom: 16 }, filters: { gap: 8, paddingBottom: 23 }, filter: { paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#fff', borderWidth: 1, borderColor: border, borderRadius: 10 }, activeFilter: { backgroundColor: purple, borderColor: purple }, filterText: { color: '#827E94', fontSize: 11, fontWeight: '700' }, inventoryCaption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }, empty: { alignItems: 'center', padding: 42 }, emptyIcon: { backgroundColor: '#F1EBFD', padding: 15, borderRadius: 18, marginBottom: 14 }, emptyTitle: { color: ink, fontSize: 15, fontWeight: '800' }, emptyText: { color: muted, fontSize: 12, textAlign: 'center', marginTop: 7 }, back: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 22 }, detailHero: { flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: '#fff', padding: 18, borderRadius: 19, borderWidth: 1, borderColor: border, marginBottom: 25 }, largePhoneArt: { width: 93, height: 114, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, detailTitle: { color: ink, fontSize: 21, fontWeight: '900', marginBottom: 6 }, infoCard: { backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: border, paddingHorizontal: 17, paddingVertical: 7, marginBottom: 25 }, infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: border, gap: 12 }, infoKey: { color: muted, fontSize: 12 }, infoValue: { color: ink, fontWeight: '700', fontSize: 12, textAlign: 'right', flexShrink: 1 }, profitBand: { backgroundColor: '#F0EBFC', borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 }, detailActions: { gap: 10, marginBottom: 12 }, button: { backgroundColor: purple, padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryButton: { backgroundColor: '#F2EEFD' }, buttonText: { color: '#fff', fontSize: 13, fontWeight: '800' }, disclaimer: { fontSize: 11, lineHeight: 18, textAlign: 'center', color: muted, marginVertical: 18 }, activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: border }, activityIcon: { width: 39, height: 39, backgroundColor: '#F1EDFB', borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderWidth: 1, borderColor: border, borderRadius: 17, backgroundColor: '#fff', marginBottom: 26 }, settingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: border }, modalOverlay: { flex: 1, backgroundColor: '#1A103E77', justifyContent: 'flex-end' }, sheet: { backgroundColor: '#fff', borderTopLeftRadius: 23, borderTopRightRadius: 23, paddingHorizontal: 23, paddingBottom: 26, paddingTop: 11 }, sheetHandle: { height: 4, width: 40, borderRadius: 2, backgroundColor: '#DAD6E2', alignSelf: 'center', marginBottom: 22 }, sheetHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }, sheetTitle: { color: ink, fontSize: 23, fontWeight: '900' }, close: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F4F8' }, fieldLabel: { fontSize: 12, fontWeight: '800', color: ink, marginBottom: 8 }, input: { backgroundColor: '#FBFAFE', borderWidth: 1, borderColor: '#E8E5EF', borderRadius: 11, height: 45, paddingHorizontal: 13, color: ink, fontSize: 13 }
});
