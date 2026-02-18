import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Share } from "@capacitor/share";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Browser } from "@capacitor/browser";

// ─── Platform Detection ─────────────────────────────────────
const isNative = Capacitor.isNativePlatform();

// ─── Initialize Native Features ─────────────────────────────
async function initApp() {
  if (isNative) {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#3c3c3c" });
  }

  // Register back button handler
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  // Register app state change listener
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      console.log("[QR App] Resumed");
    }
  });

  // Register deep link handler
  App.addListener("appUrlOpen", (event) => {
    const url = new URL(event.url);
    if (url.pathname) {
      window.location.hash = url.pathname;
    }
  });

  // Hide splash after init
  await SplashScreen.hide();
}

// ─── Native Bridge API ──────────────────────────────────────
// Expose native capabilities to the web layer
window.QRNativeBridge = {
  isNative,

  async scanQR() {
    if (!isNative) return null;
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });
      await Haptics.impact({ style: ImpactStyle.Light });
      return photo.dataUrl;
    } catch (e) {
      console.warn("[QR App] Camera error:", e);
      return null;
    }
  },

  async shareQR(dataUrl, title = "QR Code") {
    if (!isNative) {
      // Fallback to Web Share API
      if (navigator.share) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "qr-code.png", { type: "image/png" });
        await navigator.share({ title, files: [file] });
        return true;
      }
      return false;
    }
    try {
      await Share.share({
        title,
        text: "Check out this QR code",
        url: dataUrl,
        dialogTitle: "Share QR Code",
      });
      await Haptics.impact({ style: ImpactStyle.Medium });
      return true;
    } catch (e) {
      console.warn("[QR App] Share error:", e);
      return false;
    }
  },

  async hapticFeedback(style = "light") {
    if (!isNative) return;
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    await Haptics.impact({ style: map[style] || ImpactStyle.Light });
  },

  async openExternal(url) {
    await Browser.open({ url });
  },
};

// ─── Boot ───────────────────────────────────────────────────
initApp().then(() => {
  console.log("[QR App] Native bridge ready, platform:", Capacitor.getPlatform());
});
