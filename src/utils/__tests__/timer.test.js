import { describe, it, expect } from "vitest";
import { elapsedSeconds, isPaused, formatDuration, formatTimer, buildSessionFromTimer, buildManualSession, totalSecondsFor } from "../timer";

describe("elapsedSeconds", () => {
  it("returns 0 for null/empty timer", () => {
    expect(elapsedSeconds(null)).toBe(0);
    expect(elapsedSeconds({})).toBe(0);
    expect(elapsedSeconds({ segments: [] })).toBe(0);
  });

  it("counts elapsed time of running segment up to now", () => {
    const now = Date.parse("2026-05-05T10:30:00Z");
    const timer = { segments: [{ startedAt: "2026-05-05T10:00:00Z", endedAt: null }] };
    expect(elapsedSeconds(timer, now)).toBe(30 * 60);
  });

  it("sums multiple closed segments + a running one", () => {
    const now = Date.parse("2026-05-05T11:00:00Z");
    const timer = {
      segments: [
        { startedAt: "2026-05-05T09:00:00Z", endedAt: "2026-05-05T09:30:00Z" }, // 30 min
        { startedAt: "2026-05-05T10:00:00Z", endedAt: "2026-05-05T10:15:00Z" }, // 15 min
        { startedAt: "2026-05-05T10:50:00Z", endedAt: null },                    // 10 min
      ],
    };
    expect(elapsedSeconds(timer, now)).toBe(55 * 60);
  });
});

describe("isPaused", () => {
  it("paused when last segment is closed", () => {
    expect(isPaused({ segments: [{ startedAt: "x", endedAt: "y" }] })).toBe(true);
  });
  it("running when last segment is open", () => {
    expect(isPaused({ segments: [{ startedAt: "x", endedAt: null }] })).toBe(false);
  });
});

describe("formatDuration", () => {
  it("formats <1h", () => {
    expect(formatDuration(45)).toBe("1min");
    expect(formatDuration(60)).toBe("1min");
    expect(formatDuration(120)).toBe("2min");
    expect(formatDuration(45 * 60)).toBe("45min");
  });
  it("formats hours + minutes", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3660)).toBe("1h 01min");
    expect(formatDuration(2 * 3600 + 14 * 60)).toBe("2h 14min");
  });
  it("respects allowSeconds for short durations", () => {
    expect(formatDuration(45, { allowSeconds: true })).toBe("45s");
    expect(formatDuration(120, { allowSeconds: true })).toBe("2min");
  });
});

describe("formatTimer", () => {
  it("formats HH:MM:SS", () => {
    expect(formatTimer(0)).toBe("00:00:00");
    expect(formatTimer(65)).toBe("00:01:05");
    expect(formatTimer(3600 + 14 * 60 + 7)).toBe("01:14:07");
  });
});

describe("buildSessionFromTimer", () => {
  it("returns null for empty timer", () => {
    expect(buildSessionFromTimer(null)).toBe(null);
    expect(buildSessionFromTimer({ segments: [] })).toBe(null);
  });

  it("builds a session from a closed timer", () => {
    const timer = {
      segments: [{ startedAt: "2026-05-05T10:00:00Z", endedAt: "2026-05-05T10:30:00Z" }],
    };
    const s = buildSessionFromTimer(timer, "Plans");
    expect(s.startedAt).toBe("2026-05-05T10:00:00Z");
    expect(s.endedAt).toBe("2026-05-05T10:30:00Z");
    expect(s.durationSeconds).toBe(30 * 60);
    expect(s.note).toBe("Plans");
    expect(s.isManual).toBe(false);
  });
});

describe("buildManualSession", () => {
  it("builds from date + duration", () => {
    const s = buildManualSession({ date: "2026-05-04", durationMinutes: 90, note: "Suivi" });
    expect(s.durationSeconds).toBe(90 * 60);
    expect(s.isManual).toBe(true);
    expect(s.note).toBe("Suivi");
  });

  it("builds from start + end", () => {
    const s = buildManualSession({
      startedAt: "2026-05-04T09:00:00Z",
      endedAt: "2026-05-04T11:30:00Z",
    });
    expect(s.durationSeconds).toBe(150 * 60);
    expect(s.isManual).toBe(true);
  });

  it("rejects invalid duration", () => {
    expect(() => buildManualSession({ date: "2026-05-04", durationMinutes: 0 })).toThrow();
    expect(() => buildManualSession({ date: "2026-05-04", durationMinutes: -5 })).toThrow();
    expect(() => buildManualSession({ date: "2026-05-04", durationMinutes: 25 * 60 })).toThrow();
  });

  it("rejects end before start", () => {
    expect(() =>
      buildManualSession({
        startedAt: "2026-05-04T11:00:00Z",
        endedAt: "2026-05-04T09:00:00Z",
      })
    ).toThrow();
  });
});

describe("totalSecondsFor", () => {
  it("sums durations of all sessions", () => {
    expect(totalSecondsFor([])).toBe(0);
    expect(totalSecondsFor([{ durationSeconds: 100 }, { durationSeconds: 200 }])).toBe(300);
  });
  it("ignores missing durationSeconds", () => {
    expect(totalSecondsFor([{ durationSeconds: 100 }, {}])).toBe(100);
  });
});
