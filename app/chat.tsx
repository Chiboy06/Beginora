import { Redirect, useLocalSearchParams } from "expo-router";

export default function ChatLinkRoute() {
  const { voice_text: voiceText, focus } = useLocalSearchParams<{
    voice_text?: string;
    focus?: string;
  }>();
  const params = {
    ...(typeof voiceText === "string" && voiceText ? { voice_text: voiceText } : {}),
    ...(typeof focus === "string" && focus ? { focus } : {}),
  };

  return <Redirect href={{ pathname: "/talk", params }} />;
}
