import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { clearOfflineCopies, withOfflineCopy } from "./offline";

describe("offline copies", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the last good copy and uses it only when the API can't be reached", async () => {
    expect(await withOfflineCopy("u1", "tonight", async () => ({ shifts: 2 }))).toEqual({ shifts: 2 });
    expect(await withOfflineCopy("u1", "tonight", () => Promise.reject(new ApiError(0, "offline")))).toEqual({ shifts: 2, offline: true });
    await expect(withOfflineCopy("u1", "tonight", () => Promise.reject(new ApiError(500, "down")))).rejects.toThrow("down");
    await expect(withOfflineCopy("u2", "tonight", () => Promise.reject(new ApiError(0, "offline")))).rejects.toThrow("offline");
  });

  it("forgets every copy on sign-out", async () => {
    await withOfflineCopy("u1", "me", async () => ({ name: "Marcus" }));
    localStorage.setItem("steward.theme", "dark");
    clearOfflineCopies();
    await expect(withOfflineCopy("u1", "me", () => Promise.reject(new ApiError(0, "offline")))).rejects.toThrow();
    expect(localStorage.getItem("steward.theme")).toBe("dark");
  });
});
