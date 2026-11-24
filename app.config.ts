import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time settings layered over app.json. Set these in `.env.local` (see `.env.example`):
 * - EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: iOS OAuth client from Google Cloud, enables Drive sync.
 * - APP_BUNDLE_ID: iOS bundle id / Android package; must match the Google iOS client.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined;
  const bundleId = process.env.APP_BUNDLE_ID?.trim() || undefined;
  const baseSchemes = Array.isArray(config.scheme)
    ? config.scheme
    : config.scheme
      ? [config.scheme]
      : [];
  // Google redirects back to the app through the client id reversed into a URL scheme.
  const googleScheme = iosClientId ? iosClientId.split('.').reverse().join('.') : null;

  return {
    ...config,
    name: config.name ?? "Where'd It Go?",
    slug: config.slug ?? 'pocket-ledger',
    scheme: googleScheme ? [...baseSchemes, googleScheme] : baseSchemes,
    ios: {
      ...config.ios,
      bundleIdentifier: bundleId ?? config.ios?.bundleIdentifier,
    },
    android: {
      ...config.android,
      package: bundleId ?? config.android?.package,
    },
    extra: {
      ...config.extra,
      ...(iosClientId ? { googleIosClientId: iosClientId } : {}),
    },
  };
};
