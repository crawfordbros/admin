import { describe, expect, it } from "vitest";
import { afterFailure, violationForm, type QueuedViolation } from "./queue";

describe("Steward outbox", () => {
  it("retries network and server problems, and keeps refusals for the person to see", () => {
    for (const status of [0, 401, 408, 429, 500, 503]) expect(afterFailure(status), String(status)).toBe("retry");
    for (const status of [400, 403, 404, 409, 413, 415, 422]) expect(afterFailure(status), String(status)).toBe("failed");
  });

  it("uploads a violation as data plus its photos", async () => {
    const item = {
      kind: "violation",
      id: "c1",
      data: { clientId: "c1", propertyId: "p", building: "1", unit: "118", typeKey: "over_filled", note: null, loggedAt: "2026-10-29T01:14:00Z", photoTakenAt: [null] },
      photos: [{ blob: new Blob(["x"], { type: "image/jpeg" }), takenAt: null }],
    } as unknown as QueuedViolation;
    const form = violationForm(item);
    const data = JSON.parse(String(form.get("data")));
    expect(data).toMatchObject({ clientId: "c1", unit: "118", photoTakenAt: [null] });
    expect(data).not.toHaveProperty("note");
    const photo = form.getAll("photos")[0] as File;
    expect(photo.name).toBe("photo-1.jpg");
    expect(photo.type).toBe("image/jpeg");
  });
});
