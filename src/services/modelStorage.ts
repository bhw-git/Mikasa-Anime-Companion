/**
 * IndexedDB helper for persisting custom 3D models (GLB / VRM / GLTF)
 * Allows large binary 3D files (5MB - 50MB+) to persist across browser reloads.
 */

const DB_NAME = 'Mikasa3DModelDB';
const DB_VERSION = 1;
const STORE_NAME = 'models';
const CURRENT_MODEL_KEY = 'active_custom_model';
const MODEL_URL_KEY = 'mikasa_custom_model_url';

export interface StoredModelRecord {
  id: string;
  name: string;
  size: number;
  data: ArrayBuffer;
  savedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a custom GLB/VRM file to IndexedDB
 */
export async function saveCustomModelToDB(file: File): Promise<StoredModelRecord> {
  const db = await openDB();
  const buffer = await file.arrayBuffer();

  const record: StoredModelRecord = {
    id: CURRENT_MODEL_KEY,
    name: file.name,
    size: file.size,
    data: buffer,
    savedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => {
      // Clear URL preference since file is now active
      localStorage.removeItem(MODEL_URL_KEY);
      resolve(record);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get active custom model from IndexedDB
 */
export async function getActiveCustomModel(): Promise<StoredModelRecord | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(CURRENT_MODEL_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/**
 * Delete stored custom model from IndexedDB
 */
export async function clearCustomModelFromDB(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(CURRENT_MODEL_KEY);
      request.onsuccess = () => {
        localStorage.removeItem(MODEL_URL_KEY);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    localStorage.removeItem(MODEL_URL_KEY);
  }
}

/**
 * Save custom model URL preference
 */
export function saveCustomModelUrl(url: string): void {
  localStorage.setItem(MODEL_URL_KEY, url);
}

/**
 * Get saved custom model URL preference
 */
export function getSavedCustomModelUrl(): string | null {
  return localStorage.getItem(MODEL_URL_KEY);
}
