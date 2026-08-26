const DB_VERSION = 1;
const STORE = "kv";

export function webIdbName() {
  return globalThis.JPW_WEB_STORAGE_NS === "sandbox" ? "JobProfitWorkbookWebSandbox" : "JobProfitWorkbookWeb";
}

export function openWebIdbAdapter(indexedDBImpl = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(webIdbName(), DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onerror = () => reject(request.error || new Error("Could not open workbook storage."));
    request.onsuccess = () => resolve(createIdbAdapter(request.result));
  });
}

function createIdbAdapter(db) {
  return {
    async get(key) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async set(key, value) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const req = tx.objectStore(STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
  };
}
