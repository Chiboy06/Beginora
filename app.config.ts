import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Beginora",
  slug: "beginora",
  extra: {
    ...config.extra,
    apiUrl: process.env.API_URL ?? "",
    cognitoPoolId: process.env.COGNITO_POOL_ID ?? "",
    cognitoClientId: process.env.COGNITO_CLIENT_ID ?? "",
    cognitoRegion: process.env.COGNITO_REGION ?? "us-east-1",
    enableCloudSync: process.env.ENABLE_CLOUD_SYNC === "true",
    eas: { projectId: process.env.EAS_PROJECT_ID ?? "" },
  },
});
