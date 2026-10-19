jest.mock("expo-calendar/legacy", () => ({
  EntityTypes: { EVENT: "event" },
  getCalendarPermissionsAsync: jest.fn(),
  requestCalendarPermissionsAsync: jest.fn(),
  getCalendarsAsync: jest.fn(),
  getEventsAsync: jest.fn(),
}));

import { getUpcomingCalendarEvents } from "../calendar";

const mockedCalendar = jest.requireMock("expo-calendar/legacy") as {
  getCalendarPermissionsAsync: jest.Mock;
  requestCalendarPermissionsAsync: jest.Mock;
  getCalendarsAsync: jest.Mock;
  getEventsAsync: jest.Mock;
};

describe("getUpcomingCalendarEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCalendar.getCalendarPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockedCalendar.getCalendarsAsync.mockResolvedValue([{ id: "personal" }, { id: "work" }]);
    mockedCalendar.getEventsAsync.mockResolvedValue([]);
  });

  it("rejects unbounded inputs before requesting permission", async () => {
    const result = await getUpcomingCalendarEvents(365, 100);
    expect(result.success).toBe(false);
    expect(mockedCalendar.getCalendarPermissionsAsync).not.toHaveBeenCalled();
  });

  it("keeps the manual path available when calendar permission is denied", async () => {
    mockedCalendar.getCalendarPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    const result = await getUpcomingCalendarEvents();
    expect(result.success).toBe(false);
    expect(mockedCalendar.requestCalendarPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedCalendar.getEventsAsync).not.toHaveBeenCalled();
  });

  it("sorts events, removes cross-calendar duplicates, and caps the returned list", async () => {
    const future = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const later = future(5);
    const earlier = future(2);
    const earlierEnd = future(3);
    mockedCalendar.getEventsAsync.mockResolvedValue([
      { id: "work-2", calendarId: "work", title: "Review", startDate: later, endDate: future(6), allDay: false },
      { id: "home-1", calendarId: "personal", title: "Dentist", startDate: earlier, endDate: earlierEnd, allDay: false, location: "Clinic" },
      { id: "work-1", calendarId: "work", title: "Dentist", startDate: earlier, endDate: earlierEnd, allDay: false, location: "Clinic" },
    ]);

    const result = await getUpcomingCalendarEvents(30, 2);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.events).toHaveLength(2);
    expect(result.events[0].title).toBe("Dentist");
    expect(result.events[0].location).toBe("Clinic");
    expect(result.events[1].title).toBe("Review");
    expect(mockedCalendar.getEventsAsync).toHaveBeenCalledWith(["personal", "work"], expect.any(Date), expect.any(Date));
  });
});
