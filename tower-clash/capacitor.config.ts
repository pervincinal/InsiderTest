import type { CapacitorConfig } from '@capacitor/cli';

// Native shells only load the Vite build in `dist/`; no game logic lives in native code.
const config: CapacitorConfig = {
  appId: 'com.pervincinal.towerclash',
  appName: 'Tower Clash',
  webDir: 'dist',
  backgroundColor: '#0f172a',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#0f172a',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0f172a',
  },
};

export default config;
