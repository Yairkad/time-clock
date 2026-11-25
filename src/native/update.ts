import { isNative } from './platform';

const RELEASES_URL = 'https://api.github.com/repos/yairkad/time-clock/releases/latest';

const parse = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
export function isNewer(remote: string, local: string): boolean {
  const a = parse(remote), b = parse(local);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export interface UpdateInfo {
  version: string;
  apkUrl: string;
  notes: string;
}

/** Checks GitHub Releases for a newer APK (Android app only). */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isNative() || !navigator.onLine) return null;
  try {
    const res = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const rel = await res.json();
    const apk = (rel.assets as { name: string; browser_download_url: string }[] | undefined)?.find((a) => a.name.endsWith('.apk'));
    if (!apk || !isNewer(rel.tag_name, __APP_VERSION__)) return null;
    return { version: String(rel.tag_name).replace(/^v/, ''), apkUrl: apk.browser_download_url, notes: rel.body ?? '' };
  } catch {
    return null;
  }
}

/**
 * Downloads the APK inside the app (with progress) and opens Android's installer.
 * Falls back to the browser download if anything fails.
 */
export async function downloadAndInstall(url: string, onProgress: (fraction: number | null) => void) {
  const [{ Filesystem, Directory }, { FileTransfer }, { FileOpener }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/file-transfer'),
    import('@capacitor-community/file-opener'),
  ]);
  const target = await Filesystem.getUri({ directory: Directory.Cache, path: 'time-clock-update.apk' });
  const listener = await FileTransfer.addListener('progress', (p) => {
    onProgress(p.lengthComputable && p.contentLength > 0 ? p.bytes / p.contentLength : null);
  });
  try {
    const res = await FileTransfer.downloadFile({ url, path: target.uri, progress: true });
    onProgress(1);
    await FileOpener.open({
      filePath: res.path ?? target.uri,
      contentType: 'application/vnd.android.package-archive',
      openWithDefault: true,
    });
  } finally {
    await listener.remove();
  }
}

/** Fallback: let the browser download the APK. */
export async function openUpdateInBrowser(url: string) {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}
