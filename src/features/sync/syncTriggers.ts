/**
 * Sync triggers (spec §7): app foreground + connectivity regained. No polling loop.
 * Also a debounced "soon" trigger after local writes when already online.
 */
import { AppState } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export function isReallyOnline(s: NetInfoState) {
  // isInternetReachable is null while unknown; treat unknown as online-ish but let the request decide.
  return !!s.isConnected && s.isInternetReachable !== false;
}

export function startSyncTriggers(opts: { onOnlineChange: (online: boolean) => void; sync: () => void }) {
  let online = false;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const unsubNet = NetInfo.addEventListener((s) => {
    const now = isReallyOnline(s);
    if (now !== online) {
      online = now;
      opts.onOnlineChange(now);
      if (now) opts.sync(); // connectivity regained
    }
  });
  const appSub = AppState.addEventListener('change', (st) => {
    if (st === 'active' && online) opts.sync(); // foreground
  });

  return {
    /** Call after a local write; coalesces bursts into one sync 3 s later. */
    soon() {
      if (!online) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(opts.sync, 3000);
    },
    isOnline: () => online,
    stop() {
      unsubNet();
      appSub.remove();
      if (debounce) clearTimeout(debounce);
    },
  };
}
