import { openDB, IDBPDatabase } from 'idb'
import { OfflineQueueItem } from '@/types'

interface ChiaraDB {
  offline_queue: {
    key: string
    value: OfflineQueueItem
    indexes: { 'by-synced': number }
  }
  products_cache: {
    key: string
    value: { key: string; data: unknown; cached_at: string }
  }
  settings_cache: {
    key: string
    value: { key: string; data: unknown; cached_at: string }
  }
}

let db: IDBPDatabase<ChiaraDB> | null = null

export async function getDB() {
  if (db) return db
  db = await openDB<ChiaraDB>('chiara-store-pos', 1, {
    upgrade(db) {
      const queueStore = db.createObjectStore('offline_queue', { keyPath: 'id' })
      queueStore.createIndex('by-synced', 'synced')
      db.createObjectStore('products_cache', { keyPath: 'key' })
      db.createObjectStore('settings_cache', { keyPath: 'key' })
    },
  })
  return db
}

export async function addToQueue(type: OfflineQueueItem['type'], data: unknown): Promise<string> {
  const db = await getDB()
  const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  await db.add('offline_queue', { id, type, data, created_at: new Date().toISOString(), synced: false })
  return id
}

export async function getUnsyncedItems(): Promise<OfflineQueueItem[]> {
  const db = await getDB()
  const all = await db.getAll('offline_queue')
  return all.filter((item) => !item.synced)
}

export async function markAsSynced(id: string): Promise<void> {
  const db = await getDB()
  const item = await db.get('offline_queue', id)
  if (item) await db.put('offline_queue', { ...item, synced: true })
}

export async function clearSyncedItems(): Promise<void> {
  const db = await getDB()
  const all = await db.getAll('offline_queue')
  for (const item of all.filter((i) => i.synced)) {
    await db.delete('offline_queue', item.id)
  }
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB()
  const all = await db.getAll('offline_queue')
  return all.filter((item) => !item.synced).length
}

export async function cacheProducts(products: unknown): Promise<void> {
  const db = await getDB()
  await db.put('products_cache', { key: 'all_products', data: products, cached_at: new Date().toISOString() })
}

export async function getCachedProducts(): Promise<unknown | null> {
  const db = await getDB()
  const cached = await db.get('products_cache', 'all_products')
  return cached ? cached.data : null
}

export async function cacheSettings(settings: unknown): Promise<void> {
  const db = await getDB()
  await db.put('settings_cache', { key: 'store_settings', data: settings, cached_at: new Date().toISOString() })
}

export async function getCachedSettings(): Promise<unknown | null> {
  const db = await getDB()
  const cached = await db.get('settings_cache', 'store_settings')
  return cached ? cached.data : null
}
