import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'il.timeclock.app',
  appName: 'שעון נוכחות',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_clock', iconColor: '#0f766e' },
  },
};

export default config;
