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

/** Opens the APK download; Android then offers to install it over the current version. */
export async function openUpdate(url: string) {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}
