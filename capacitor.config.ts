import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Wraps the built web app as a native iOS app. `webDir` is Vite's output, so
 * `npm run build && npx cap sync` is the whole pipeline.
 *
 * Building and signing the app still requires macOS with Xcode — see the
 * "Native iOS app" section of the README.
 */
const config: CapacitorConfig = {
  appId: 'com.kytorini.pkmcollector',
  appName: 'Pkm Collector',
  webDir: 'dist',
  ios: {
    // The app's own dark ground, so launch and overscroll don't flash white.
    backgroundColor: '#0e1016',
    contentInset: 'always',
  },
}

export default config
