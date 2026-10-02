/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: { args: { $0: 'jest', config: 'e2e/jest.config.js' } },
  apps: {
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      build: 'cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release',
    },
  },
  devices: {
    // Create once: avdmanager create avd -n LowEnd_API26 -k "system-images;android-26;google_apis;x86" -d "Nexus 5"
    // then set hw.ramSize=2048 in its config.ini to match the 2 GB reference device.
    emulator: { type: 'android.emulator', device: { avdName: 'LowEnd_API26' } },
  },
  configurations: { 'android.emu.release': { device: 'emulator', app: 'android.release' } },
};
