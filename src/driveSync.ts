/**
 * Google Drive Sync Service
 * 
 * Handles backup and restore of the entire Dexie database to/from
 * a single JSON file in the user's Google Drive appDataFolder.
 * 
 * Uses raw fetch against Google Drive API v3 — no heavy gapi client needed.
 */

import { db } from './db';

const BACKUP_FILENAME = 'fintrack-backup.json';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

// ── helpers ──────────────────────────────────────────────────────────

function authHeaders(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
}

// ── Find existing backup file in appDataFolder ──────────────────────

async function findBackupFile(accessToken: string): Promise<string | null> {
    const query = `name='${BACKUP_FILENAME}' and trashed=false`;
    const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`;

    const res = await fetch(url, { headers: authHeaders(accessToken) });
    if (!res.ok) throw new Error(`Drive search failed: ${res.status}`);

    const data = await res.json();
    return data.files?.[0]?.id || null;
}

// ── Get backup metadata (last modified time) ────────────────────────

export async function getBackupInfo(accessToken: string): Promise<{ lastModified: string } | null> {
    const query = `name='${BACKUP_FILENAME}' and trashed=false`;
    const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`;

    const res = await fetch(url, { headers: authHeaders(accessToken) });
    if (!res.ok) return null;

    const data = await res.json();
    const file = data.files?.[0];
    if (!file) return null;

    return { lastModified: file.modifiedTime };
}

// ── Upload (create or update) ───────────────────────────────────────

export async function uploadBackup(accessToken: string): Promise<void> {
    // 1. Serialize entire DB
    const payload = {
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        categories: await db.categories.toArray(),
        accounts: await db.accounts.toArray(),
        transactions: await db.transactions.toArray(),
    };
    const jsonBlob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

    // 2. Check if file already exists
    const existingId = await findBackupFile(accessToken);

    if (existingId) {
        // Update existing file content (PATCH)
        const res = await fetch(`${DRIVE_UPLOAD_URL}/${existingId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                ...authHeaders(accessToken),
                'Content-Type': 'application/json',
            },
            body: jsonBlob,
        });
        if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
    } else {
        // Create new file in appDataFolder (multipart)
        const metadata = {
            name: BACKUP_FILENAME,
            parents: ['appDataFolder'],
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', jsonBlob);

        const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
            method: 'POST',
            headers: authHeaders(accessToken),
            body: form,
        });
        if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
    }
}

// ── Download and restore ────────────────────────────────────────────

export async function downloadAndRestore(accessToken: string): Promise<{ categories: number; accounts: number; transactions: number }> {
    const fileId = await findBackupFile(accessToken);
    if (!fileId) throw new Error('No backup found in Google Drive');

    const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
        headers: authHeaders(accessToken),
    });
    if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);

    const data = await res.json();

    if (!data.categories || !data.accounts || !data.transactions) {
        throw new Error('Invalid backup file format');
    }

    // Clear and restore
    await db.transaction('rw', db.categories, db.accounts, db.transactions, async () => {
        await db.categories.clear();
        await db.accounts.clear();
        await db.transactions.clear();

        await db.categories.bulkAdd(data.categories.map(({ id, ...rest }: any) => rest));
        await db.accounts.bulkAdd(data.accounts.map(({ id, ...rest }: any) => rest));
        await db.transactions.bulkAdd(data.transactions.map(({ id, ...rest }: any) => rest));
    });

    return {
        categories: data.categories.length,
        accounts: data.accounts.length,
        transactions: data.transactions.length,
    };
}
