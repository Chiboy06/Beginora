import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EAS_PROJECT_ID?.trim();
  const updateChannel = process.env.EAS_UPDATE_CHANNEL?.trim() || "preview";
  const updatesEnabled = process.env.EAS_UPDATES_ENABLED === "true" && !!projectId;
  const existingExtra = config.extra ?? {};
  const updates = updatesEnabled
    ? {
        enabled: true,
        url: `https://u.expo.dev/${projectId}`,
        requestHeaders: { "expo-channel-name": updateChannel },
        checkAutomatically: "NEVER" as const,
        fallbackToCacheTimeout: 0,
      }
    : { enabled: false };

  return {
    ...config,
    name: "Beginora",
    slug: "beginora",
    ...(updatesEnabled ? { runtimeVersion: { policy: "appVersion" as const } } : {}),
    updates,
    extra: {
      ...existingExtra,
      apiUrl: process.env.API_URL ?? "",
      cognitoPoolId: process.env.COGNITO_POOL_ID ?? "",
      cognitoClientId: process.env.COGNITO_CLIENT_ID ?? "",
      cognitoRegion: process.env.COGNITO_REGION ?? "us-east-1",
      enableCloudSync: process.env.ENABLE_CLOUD_SYNC === "true",
      updateChannel,
      ...(projectId
        ? { eas: { ...(existingExtra.eas ?? {}), projectId } }
        : {}),
    },
  };
};
