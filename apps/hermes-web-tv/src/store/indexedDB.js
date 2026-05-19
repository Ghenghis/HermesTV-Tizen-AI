// indexedDB.js — tiny Promise wrapper around the browser IndexedDB API.
//
// Why no `idb` library: HermesTV ships to a Tizen 6.5 webview (Chromium 76)
// and bundle size matters. The native IDB surface is ugly but stable; this
// wrapper covers exactly the calls our two stores need (open + upgrade,
// put/get/getAll/delete/clear, range query via index) and nothing else.
//
// Constraints intentionally honored:
//   - ES5 style (var, function expressions, no optional chaining, no `await using`).
//   - Promises only — no async/await sugar so the compiled output stays small
//     and predictable across older Chromium engines.
//   - Errors surface to the caller as rejected Promises. Stores layered on top
//     decide whether to swallow them (with console.warn) or propagate.
//
// DB identity is fixed:
//   - Name:    'hermestv-v1'
//   - Version: 1
// New stores added in future versions bump the version number; the `upgrade`
// callback signature mirrors IDBOpenDBRequest.onupgradeneeded so callers can
// branch on `oldVersion`.
//
// Failure modes worth noting:
//   - Private-browsing / opaque-origin iframes can throw on open() with
//     SecurityError. The Promise rejects; consumers log and degrade.
//   - Quota-exceeded errors land on the transaction abort handler. We pass
//     the underlying DOMException through so stores can detect QuotaExceededError
//     and prune if they want to.

var DB_NAME = 'hermestv-v1';
var DB_VERSION = 1;

function isIDBAvailable() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch (e) {
    return false;
  }
}

function openDB(dbName, version, upgrade) {
  return new Promise(function(resolve, reject) {
    if (!isIDBAvailable()) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    var name = dbName || DB_NAME;
    var ver = version || DB_VERSION;
    var request;
    try {
      request = indexedDB.open(name, ver);
    } catch (e) {
      reject(e);
      return;
    }
    request.onupgradeneeded = function(event) {
      try {
        if (typeof upgrade === 'function') {
          upgrade(request.result, event.oldVersion || 0, event.newVersion || ver);
        }
      } catch (err) {
        // Surface upgrade errors via the open request rejection path.
        try { request.transaction.abort(); } catch (abortErr) { /* ignore */ }
        reject(err);
      }
    };
    request.onsuccess = function() {
      var db = request.result;
      // Generic error trap on the DB itself — fires when an unhandled
      // transaction error bubbles up. We don't reject here (the open already
      // succeeded), but we log so silent corruption doesn't go unnoticed.
      db.onerror = function(ev) {
        var err = ev && ev.target && ev.target.error;
        try {
          console.warn('[indexedDB] DB error:', err && err.name ? err.name : 'unknown');
        } catch (e2) { /* ignore */ }
      };
      resolve(db);
    };
    request.onerror = function() {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
    request.onblocked = function() {
      reject(new Error('IndexedDB open blocked by an older connection'));
    };
  });
}

function tx(db, storeName, mode) {
  if (!db) {
    throw new Error('tx() called without a db handle');
  }
  var m = mode === 'readwrite' ? 'readwrite' : 'readonly';
  return db.transaction(storeName, m);
}

function _requestToPromise(request) {
  return new Promise(function(resolve, reject) {
    request.onsuccess = function() { resolve(request.result); };
    request.onerror = function() { reject(request.error || new Error('IndexedDB request failed')); };
  });
}

function put(db, storeName, value) {
  return new Promise(function(resolve, reject) {
    var transaction;
    try {
      transaction = tx(db, storeName, 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    var store = transaction.objectStore(storeName);
    var req;
    try {
      req = store.put(value);
    } catch (e2) {
      reject(e2);
      return;
    }
    req.onsuccess = function() { resolve(req.result); };
    transaction.onerror = function() { reject(transaction.error || new Error('put() transaction failed')); };
    transaction.onabort = function() { reject(transaction.error || new Error('put() transaction aborted')); };
  });
}

function get(db, storeName, key) {
  try {
    var transaction = tx(db, storeName, 'readonly');
    var store = transaction.objectStore(storeName);
    return _requestToPromise(store.get(key));
  } catch (e) {
    return Promise.reject(e);
  }
}

function getAll(db, storeName, indexName, query) {
  return new Promise(function(resolve, reject) {
    var transaction;
    try {
      transaction = tx(db, storeName, 'readonly');
    } catch (e) {
      reject(e);
      return;
    }
    var store = transaction.objectStore(storeName);
    var source = indexName ? store.index(indexName) : store;
    var req;
    try {
      // getAll() takes an optional IDBKeyRange or key value; pass query through
      // when provided so callers can do per-profile lookups via index.
      req = query !== undefined && query !== null ? source.getAll(query) : source.getAll();
    } catch (e2) {
      reject(e2);
      return;
    }
    req.onsuccess = function() { resolve(req.result || []); };
    req.onerror = function() { reject(req.error || new Error('getAll() request failed')); };
  });
}

function del(db, storeName, key) {
  return new Promise(function(resolve, reject) {
    var transaction;
    try {
      transaction = tx(db, storeName, 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    var store = transaction.objectStore(storeName);
    var req;
    try {
      req = store['delete'](key);
    } catch (e2) {
      reject(e2);
      return;
    }
    req.onsuccess = function() { resolve(); };
    transaction.onerror = function() { reject(transaction.error || new Error('delete() transaction failed')); };
    transaction.onabort = function() { reject(transaction.error || new Error('delete() transaction aborted')); };
  });
}

function clear(db, storeName) {
  return new Promise(function(resolve, reject) {
    var transaction;
    try {
      transaction = tx(db, storeName, 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    var store = transaction.objectStore(storeName);
    var req;
    try {
      req = store.clear();
    } catch (e2) {
      reject(e2);
      return;
    }
    req.onsuccess = function() { resolve(); };
    transaction.onerror = function() { reject(transaction.error || new Error('clear() transaction failed')); };
    transaction.onabort = function() { reject(transaction.error || new Error('clear() transaction aborted')); };
  });
}

// Note: the public name is `delete` (matches the spec on item 6 of the task
// list) but the internal binding is `del` because `delete` is a reserved
// word and can't be a function declaration name in strict mode. We expose
// it as a named module export and also as a `deleteRecord` alias so
// consumers can pick whichever is more readable at the call site.
export {
  DB_NAME,
  DB_VERSION,
  isIDBAvailable,
  openDB,
  tx,
  put,
  get,
  getAll,
  del as deleteRecord,
  del as delete,
  clear
};
