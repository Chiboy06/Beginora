// A fake recognizer: each start() plays the next scripted pass of events.
type Handler = (e: any) => void;
const mockHandlers: Record<string, Handler[]> = {};
const mockPasses: { events: [string, any][] }[] = [];
const mockStarts: any[] = [];

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => true,
    supportsOnDeviceRecognition: () => true,
    requestPermissionsAsync: async () => ({ granted: true }),
    abort: jest.fn(),
    addListener: (name: string, fn: Handler) => {
      (mockHandlers[name] ??= []).push(fn);
      return { remove: () => { mockHandlers[name] = mockHandlers[name].filter((h) => h !== fn); } };
    },
    start: (options: any) => {
      mockStarts.push(options);
      const pass = mockPasses.shift();
      setTimeout(() => {
        for (const [name, e] of pass?.events ?? [["end", null]]) for (const h of [...(mockHandlers[name] ?? [])]) h(e);
      }, 0);
    },
  },
}));
jest.mock("../../native/voice-input", () => ({ startVoiceRecognition: jest.fn(async () => ({ status: "success", text: "from pop-up" })) }));

import { listen } from "../listen";

const said = (text: string, isFinal = true): [string, any] => ["result", { isFinal, results: [{ transcript: text }] }];

beforeEach(() => {
  mockPasses.length = 0;
  mockStarts.length = 0;
});

test("words arrive live, and the final words are returned", async () => {
  mockPasses.push({ events: [said("set me", false), said("set me a task"), ["end", null]] });
  const partial: string[] = [];
  expect(await listen({ onPartial: (t) => partial.push(t) })).toEqual({ status: "success", text: "set me a task" });
  expect(partial).toEqual(["set me", "set me a task"]);
  // Local first: on-device recognition is asked for.
  expect(mockStarts[0]).toMatchObject({ requiresOnDeviceRecognition: true, interimResults: true });
});

test("trailing off on 'and' keeps listening and joins the parts", async () => {
  mockPasses.push({ events: [said("read by 5, and"), ["end", null]] });
  mockPasses.push({ events: [said("by 6 jogging"), ["end", null]] });
  expect(await listen()).toEqual({ status: "success", text: "read by 5, and by 6 jogging" });
  expect(mockStarts).toHaveLength(2);
});

test("no offline language pack: retries with the phone's normal recognizer", async () => {
  mockPasses.push({ events: [["error", { error: "language-not-supported" }]] });
  mockPasses.push({ events: [said("hello"), ["end", null]] });
  expect(await listen()).toEqual({ status: "success", text: "hello" });
  expect(mockStarts[1]).toMatchObject({ requiresOnDeviceRecognition: false });
});

test("silence returns cancelled, not an error", async () => {
  mockPasses.push({ events: [["error", { error: "no-speech" }]] });
  expect(await listen()).toEqual({ status: "cancelled" });
});
