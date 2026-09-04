/**
 * Minimal IndexedDB key/value store. Card data runs to a few hundred KB per
 * set, which overruns localStorage once you track the whole vintage era.
 */
const DB_NAME = 'pkm-collector'
const DB_VERSION = 1
const STORE = 'cache'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
  } catch {
    return undefined
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(value, key) as IDBRequest<IDBValidKey>)
  } catch {
    /* cache writes are best effort */
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(key) as IDBRequest<undefined>)
  } catch {
    /* ignore */
  }
}

export async function idbClear(): Promise<void> {
  try {
    await run('readwrite', (s) => s.clear() as IDBRequest<undefined>)
  } catch {
    /* ignore */
  }
}
