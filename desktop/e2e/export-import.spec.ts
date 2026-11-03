import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { stubTokenRefresh } from './helpers/auth';
import { withAdminApi, withApiAs } from './helpers/provisioning';

interface ManifestEntry {
  name: string;
  kind: string;
  rows?: number;
}

interface Manifest {
  format: string;
  formatVersion: number;
  includesFiles: boolean;
  entries: ManifestEntry[];
  missingFiles: string[];
}

/** Reads one entry of a ZIP through its central directory (stored or deflated). */
function readZipEntry(zip: Buffer, name: string): Buffer {
  const endOfDirectory = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOfDirectory < 0) {
    throw new Error('not a ZIP');
  }
  const entries = zip.readUInt16LE(endOfDirectory + 10);
  let offset = zip.readUInt32LE(endOfDirectory + 16);
  for (let i = 0; i < entries; i++) {
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeader = zip.readUInt32LE(offset + 42);
    const entryName = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (entryName === name) {
      const localNameLength = zip.readUInt16LE(localHeader + 26);
      const localExtraLength = zip.readUInt16LE(localHeader + 28);
      const start = localHeader + 30 + localNameLength + localExtraLength;
      const data = zip.subarray(start, start + compressedSize);
      return method === 0 ? data : inflateRawSync(data);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${name} not in the ZIP`);
}

// Other specs add and remove receipts in parallel, so counts are compared by shape (the same tables), never by
// value; the Go round-trip tests pin the values.
test.describe('Export & import (System Settings)', () => {
  test('an admin downloads the household as a ZIP with a manifest', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/admin.json', acceptDownloads: true });
    const page = await context.newPage();
    await stubTokenRefresh(page);

    await page.goto('/system-settings/export-import');
    await expect(page.getByRole('tab', { name: 'Export & import' })).toBeVisible();
    await expect(page.getByTestId('export-count').first()).not.toHaveText('–');

    // Without photos: a small file whatever the server holds.
    await page.getByTestId('export-include-files').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
    expect(download.suggestedFilename()).toMatch(/^cartvibe-backup-\d{4}-\d{2}-\d{2}\.zip$/);
    await expect(page.getByTestId('export-status')).toContainText('The download has started');

    const zip = readFileSync(await download.path());
    const manifest = JSON.parse(readZipEntry(zip, 'manifest.json').toString('utf8')) as Manifest;
    expect(manifest.format).toBe('cartvibe-backup');
    expect(manifest.includesFiles).toBe(false);
    expect(manifest.entries.every((entry) => entry.kind === 'table')).toBe(true);

    const summary = await withAdminApi(async (api) => (await api.get('/api/backup/summary')).json());
    const tables = manifest.entries.map((entry) => entry.name.replace(/\.csv$/, '')).sort();
    expect(tables).toEqual(summary.counts.map((count: { name: string }) => count.name).sort());

    const receipts = readZipEntry(zip, 'receipts.csv').toString('utf8');
    expect(receipts.startsWith('﻿id,group_id,name,')).toBe(true);
    expect(receipts).not.toContain('password');

    await context.close();
  });

  test('a household member can neither see the tab nor export', async ({ browser }) => {
    const status = await withApiAs('user', async (api) => (await api.get('/api/backup/export')).status());
    expect(status).toBe(403);

    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();
    await stubTokenRefresh(page);
    await page.goto('/system-settings/export-import');
    await expect(page).not.toHaveURL(/export-import/);
    await context.close();

    const importStatus = await withApiAs('user', async (api) => (await api.get('/api/backup/import')).status());
    expect(importStatus).toBe(403);
  });

  // The shared e2e server always has receipts, so an import can only be previewed and refused here; the full
  // import into an empty server is the Go round-trip test.
  test('an import into a server with data is previewed, refused and changes nothing', async ({ browser }) => {
    const zip = await withAdminApi(async (api) => (await api.get('/api/backup/export?includeFiles=false')).body());

    const context = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await context.newPage();
    await stubTokenRefresh(page);
    await page.goto('/system-settings/export-import');
    await expect(page.getByTestId('settings-card-import')).toBeVisible();

    await page.getByTestId('import-file-input').setInputFiles({ name: 'cartvibe-backup.zip', mimeType: 'application/zip', buffer: zip });
    const dialog = page.getByTestId('import-preview');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('import-preview-blockers')).toContainText('already has receipts');
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    // Nothing was queued, and Cancel dropped the uploaded file's job.
    await expect
      .poll(async () => {
        const jobs = await withAdminApi(async (api) => (await api.get('/api/backup/import')).json());
        return jobs.filter((job: { status: string }) => job.status !== 'failed').length;
      })
      .toBe(0);

    // A file that is not an export is refused with the server's reason.
    await page.getByTestId('import-file-input').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
    await expect(page.getByText('This file is not a CartVibe export.')).toBeVisible();

    await context.close();
  });
});
