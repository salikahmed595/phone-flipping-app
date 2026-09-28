import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const { status: next } = await Notifications.requestPermissionsAsync();
  return next === 'granted';
}

const NOTIFIED_KEY = 'flipwise_notified_v1';

async function alreadyNotified(id: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFIED_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    return set.includes(id);
  } catch {
    return false;
  }
}

async function markNotified(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFIED_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(id)) set.push(id);
    await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(set.slice(-200)));
  } catch {
    // best effort
  }
}

async function notifyOnce(id: string, title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (await alreadyNotified(id)) return;
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
    await markNotified(id);
  } catch {
    // best effort — permission may not be granted yet
  }
}

export async function notifyWarrantyExpiring(deviceCode: string, model: string, daysRemaining: number): Promise<void> {
  const id = `warranty-${deviceCode}-${daysRemaining}`;
  const body = daysRemaining === 0 ? `${model} (${deviceCode})'s warranty expires today.` : `${model} (${deviceCode})'s warranty expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`;
  await notifyOnce(id, 'Warranty ending soon', body);
}

export async function notifyLowStock(partName: string, quantity: number): Promise<void> {
  const id = `lowstock-${partName}-${quantity}`;
  const body = quantity === 0 ? `${partName} is out of stock.` : `Only ${quantity} left of ${partName}.`;
  await notifyOnce(id, 'Parts running low', body);
}
