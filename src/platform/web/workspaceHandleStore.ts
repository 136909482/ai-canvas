const DB_NAME = 'ai-canvas-platform'
const STORE_NAME = 'handles'
const WORKSPACE_DIRECTORY_KEY = 'workspace-directory'

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1)

    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function withStore<T>(mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase()

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    const request = task(store)

    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
    request.onsuccess = () => resolve(request.result)

    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
}

export async function getStoredWorkspaceDirectoryHandle() {
  return withStore<FileSystemDirectoryHandle | undefined>('readonly', (store) => store.get(WORKSPACE_DIRECTORY_KEY))
}

export async function setStoredWorkspaceDirectoryHandle(handle: FileSystemDirectoryHandle) {
  await withStore('readwrite', (store) => store.put(handle, WORKSPACE_DIRECTORY_KEY))
}

export async function clearStoredWorkspaceDirectoryHandle() {
  await withStore('readwrite', (store) => store.delete(WORKSPACE_DIRECTORY_KEY))
}
