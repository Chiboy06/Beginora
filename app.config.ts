import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EAS_PROJECT_ID?.trim();
  const existingExtra = config.extra ?? {};

  return {
    ...config,
    name: "Beginora",
    slug: "beginora",
    extra: {
      ...existingExtra,
      apiUrl: process.env.API_URL ?? "",
      cognitoPoolId: process.env.COGNITO_POOL_ID ?? "",
      cognitoClientId: process.env.COGNITO_CLIENT_ID ?? "",
      cognitoRegion: process.env.COGNITO_REGION ?? "us-east-1",
      enableCloudSync: process.env.ENABLE_CLOUD_SYNC === "true",
      ...(projectId
        ? { eas: { ...(existingExtra.eas ?? {}), projectId } }
        : {}),
    },
  };
};
