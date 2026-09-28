import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { addDevice, addExpense, logRepair, markReadyForSale, recordSale } from './api';
import type { QueuedAction, QueuedActionType } from './types';

const KEY = 'flipwise_outbox_v1';

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // best effort — if storage is unavailable there's nothing more we can do
  }
}

export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

export async function enqueue(type: QueuedActionType, payload: any, label: string): Promise<void> {
  const queue = await readQueue();
  queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type, payload, label, createdAt: Date.now() });
  await writeQueue(queue);
}

export async function getQueue(): Promise<QueuedAction[]> {
  return readQueue();
}

async function runAction(action: QueuedAction): Promise<void> {
  switch (action.type) {
    case 'addDevice':
      await addDevice(action.payload);
      return;
    case 'logRepair':
      await logRepair(action.payload);
      return;
    case 'addExpense':
      await addExpense(action.payload);
      return;
    case 'recordSale':
      await recordSale(action.payload);
      return;
    case 'markReadyForSale':
      await markReadyForSale(action.payload.deviceUuid);
      return;
  }
}

// Applies queued actions in order, stopping at the first one that still
// fails (network still down, or a real error) so nothing is lost or
// applied out of order.
export async function flushQueue(): Promise<{ synced: number; remaining: number }> {
  let queue = await readQueue();
  let synced = 0;
  while (queue.length > 0) {
    const next = queue[0];
    try {
      await runAction(next);
      queue = queue.slice(1);
      await writeQueue(queue);
      synced += 1;
    } catch {
      break;
    }
  }
  return { synced, remaining: queue.length };
}

export function subscribeConnectivity(onChange: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => {
    onChange(state.isConnected !== false && state.isInternetReachable !== false);
  });
}
