import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInviteToken } from "../useInviteToken";

const KEY = "archipilot_pending_invite";

function setUrl(search) {
  // happy-dom doesn't allow assigning to window.location.search directly,
  // so go through replaceState which is supported.
  window.history.replaceState({}, "", search);
}

describe("useInviteToken", () => {
  beforeEach(() => {
    localStorage.clear();
    setUrl("/");
  });

  it("returns null when there is no token in URL or localStorage", () => {
    const { result } = renderHook(() => useInviteToken());
    expect(result.current.inviteToken).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("reads the token from the URL and persists it to localStorage", () => {
    setUrl("/?invite=abc123");
    const { result } = renderHook(() => useInviteToken());
    expect(result.current.inviteToken).toBe("abc123");
    expect(localStorage.getItem(KEY)).toBe("abc123");
  });

  it("falls back to localStorage when the URL no longer carries the param", () => {
    localStorage.setItem(KEY, "stored-token");
    const { result } = renderHook(() => useInviteToken());
    expect(result.current.inviteToken).toBe("stored-token");
  });

  it("URL takes precedence over localStorage when both are set", () => {
    localStorage.setItem(KEY, "old");
    setUrl("/?invite=fresh");
    const { result } = renderHook(() => useInviteToken());
    expect(result.current.inviteToken).toBe("fresh");
    expect(localStorage.getItem(KEY)).toBe("fresh");
  });

  it("clearPendingInvite empties both the state and localStorage", () => {
    localStorage.setItem(KEY, "to-be-cleared");
    const { result } = renderHook(() => useInviteToken());
    expect(result.current.inviteToken).toBe("to-be-cleared");
    act(() => result.current.clearPendingInvite());
    expect(result.current.inviteToken).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("setInviteToken from the server-side fallback path updates the state", () => {
    const { result } = renderHook(() => useInviteToken());
    expect(result.current.inviteToken).toBeNull();
    act(() => result.current.setInviteToken("from-server"));
    expect(result.current.inviteToken).toBe("from-server");
  });
});
