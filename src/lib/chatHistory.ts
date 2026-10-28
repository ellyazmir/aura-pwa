/**
 * Chat history, stored on the student's own device (IndexedDB). Nothing is sent to the server.
 * IndexedDB is used instead of localStorage because chats can contain photos of questions.
 */
import type { Message } from '../types/cikgu';

export interface SavedChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  /** Socratic phase (1-3) the chat had reached. */
  currentPhase: number;
  subject: string;
  level: string;
}

const DB_NAME = 'aura-tutor';
const STORE = 'chats';
const MAX_CHATS = 50; // oldest chats are removed after this many

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** All saved chats, newest first. Returns [] when storage is unavailable. */
export async function listChats(): Promise<SavedChat[]> {
  try {
    const db = await openDb();
    const all = await request<SavedChat[]>(db.transaction(STORE).objectStore(STORE).getAll());
    db.close();
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Create or update a chat. Failures are ignored: history is a convenience, never a blocker. */
export async function saveChat(chat: SavedChat): Promise<void> {
  try {
    // The raw base64 copy of a photo is not needed to show it again (previewUrl has it).
    const slim: SavedChat = {
      ...chat,
      messages: chat.messages.map((m) =>
        m.image ? { ...m, image: { ...m.image, data: '' } } : m,
      ),
    };
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(slim);
    await done(tx);

    // Keep only the newest MAX_CHATS
    const all = await request<SavedChat[]>(db.transaction(STORE).objectStore(STORE).getAll());
    if (all.length > MAX_CHATS) {
      const extra = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(MAX_CHATS);
      const tx2 = db.transaction(STORE, 'readwrite');
      extra.forEach((c) => tx2.objectStore(STORE).delete(c.id));
      await done(tx2);
    }
    db.close();
  } catch {
    // ignore
  }
}

export async function deleteChat(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await done(tx);
    db.close();
  } catch {
    // ignore
  }
}

export async function clearChats(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await done(tx);
    db.close();
  } catch {
    // ignore
  }
}

export function newChatId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Title = the first question the student asked (shortened). */
export function chatTitle(messages: Message[]): string {
  const first = messages.find((m) => m.role === 'user')?.content.replace(/\s+/g, ' ').trim() ?? '';
  if (!first) return 'Sembang baharu';
  return first.length > 60 ? `${first.slice(0, 57)}...` : first;
}
