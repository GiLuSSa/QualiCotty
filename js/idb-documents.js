/* QualiCotty — IndexedDB persistence for documents
 * Loaded before index.js. Exposes window.QualiCottyIdb.
 */
(function (global) {
    'use strict';

    const DB_NAME = 'qualicotty';
    const DB_VERSION = 1;
    const STORE_NAME = 'documents';
    const DOCS_KEY = 'project';

    let dbPromise = null;

    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!global.indexedDB) {
                reject(new Error('IndexedDB is not available'));
                return;
            }
            const req = global.indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function () {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = function () {
                resolve(req.result);
            };
            req.onerror = function () {
                dbPromise = null;
                reject(req.error || new Error('Failed to open IndexedDB'));
            };
        });
        return dbPromise;
    }

    function getDocuments() {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.get(DOCS_KEY);
                req.onsuccess = function () {
                    const value = req.result;
                    resolve(Array.isArray(value) ? value : []);
                };
                req.onerror = function () {
                    reject(req.error || new Error('Failed to read documents from IndexedDB'));
                };
            });
        });
    }

    function setDocuments(docs) {
        const list = Array.isArray(docs) ? docs : [];
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.put(list, DOCS_KEY);
                tx.oncomplete = function () {
                    resolve();
                };
                tx.onerror = function () {
                    reject(tx.error || new Error('Failed to write documents to IndexedDB'));
                };
                tx.onabort = function () {
                    reject(tx.error || new Error('IndexedDB write aborted'));
                };
            });
        });
    }

    function clearDocuments() {
        return setDocuments([]);
    }

    global.QualiCottyIdb = {
        open: open,
        getDocuments: getDocuments,
        setDocuments: setDocuments,
        clearDocuments: clearDocuments
    };
})(typeof window !== 'undefined' ? window : this);
