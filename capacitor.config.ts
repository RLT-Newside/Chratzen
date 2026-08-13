import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.rltnewside.chratzen',
  appName: 'Chratzen',
  webDir: 'dist',
  server: {
    // http statt https als WebView-Origin: sonst gilt eine Verbindung zu
    // ws://192.168.x.x:3001 (Server im WLAN) als Mixed Content und wird blockiert.
    androidScheme: 'http',
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  plugins: {
    SplashScreen: { launchShowDuration: 0 },
  },
}

export default config
