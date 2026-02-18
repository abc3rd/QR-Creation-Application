import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.omegaui.qrcreation",
  appName: "QR Creation",
  webDir: "../web/out",
  server: {
    // For development: point to local dev server
    // url: "http://10.0.2.2:8888",
    // For production: use the static export in webDir
    androidScheme: "https",
    allowNavigation: [
      "syncloudconnect.com",
      "*.syncloudconnect.com",
      "*.vercel.app",
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#3c3c3c",
    buildOptions: {
      keystorePath: "release-key.jks",
      keystoreAlias: "qrcreation",
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#3c3c3c",
      androidSplashResourceName: "splash",
      showSpinner: false,
      androidSpinnerStyle: "small",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#3c3c3c",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    Camera: {
      permissions: ["camera"],
    },
  },
};

export default config;
