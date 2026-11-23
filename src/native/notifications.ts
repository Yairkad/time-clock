import { isNative } from './platform';

const ACTIVE_ID = 1001;
const CHANNEL = 'active-entry';
let ready: Promise<boolean> | null = null;

async function setup(): Promise<boolean> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
    perm = await LocalNotifications.requestPermissions();
  }
  if (perm.display !== 'granted') return false;
  await LocalNotifications.createChannel({
    id: CHANNEL,
    name: 'רישום פעיל',
    description: 'מוצג כל עוד יש רישום שעות פתוח',
    importance: 2, // low: no sound
    visibility: 1,
  });
  return true;
}

/** Shows a persistent notification while an entry is open; removes it otherwise. */
export async function syncActiveNotification(active: { employerName: string; startLabel: string } | null) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: ACTIVE_ID }] });
    if (!active) return;
    ready ??= setup();
    if (!(await ready)) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ACTIVE_ID,
          channelId: CHANNEL,
          title: `בעבודה — ${active.employerName}`,
          body: `מ־${active.startLabel} · לחיצה לפתיחה`,
          ongoing: true,
          autoCancel: false,
          smallIcon: 'ic_stat_clock',
        },
      ],
    });
  } catch (e) {
    console.warn('notification failed', e);
  }
}
