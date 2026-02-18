# Google Play Store Release Checklist

## Pre-Build
- [ ] Update `versionCode` and `versionName` in `android/app/build.gradle`
- [ ] Test all QR code types generate correctly on device
- [ ] Test camera scanning works
- [ ] Test share functionality
- [ ] Test deep links (`qrcreation://` scheme)
- [ ] Verify brand colors render correctly (#ea00ea, #2699fe, #4bce2a, #3c3c3c, #c4653a)

## Build
- [ ] Run `./scripts/build-release.sh`
- [ ] Verify AAB is signed: `jarsigner -verify -verbose android/app/build/outputs/bundle/release/app-release.aab`

## Store Assets (required by Google Play)
- [ ] App icon (512x512 PNG) — auto-generated in `resources/android/playstore-icon.png`
- [ ] Feature graphic (1024x500 PNG) — create in Figma/Canva with brand colors
- [ ] Phone screenshots (min 2, 16:9 or 9:16) — capture from device/emulator
- [ ] 7-inch tablet screenshots (optional but recommended)
- [ ] 10-inch tablet screenshots (optional but recommended)

## Store Listing
- [ ] Title (max 30 chars): "QR Creation"
- [ ] Short description (max 80 chars): see listing.json
- [ ] Full description (max 4000 chars): see listing.json
- [ ] Category: Productivity
- [ ] Content rating questionnaire: completed
- [ ] Privacy policy URL: https://syncloudconnect.com/privacy
- [ ] Contact email: ucp@syncloudconnect.com

## Upload
- [ ] Create app in Google Play Console
- [ ] Upload AAB to Production / Internal testing track
- [ ] Set pricing: Free (or set price)
- [ ] Target countries/regions
- [ ] Complete Data Safety section
- [ ] Submit for review

## Post-Launch
- [ ] Monitor crash reports in Play Console
- [ ] Set up staged rollout (10% → 50% → 100%)
- [ ] Respond to user reviews
