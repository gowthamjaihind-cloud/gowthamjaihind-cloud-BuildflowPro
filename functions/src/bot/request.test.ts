import { describe, it, expect } from "vitest";
import { looksLikeRequest } from "./request";

describe("looksLikeRequest", () => {
  it("sends orders, payments, vendors, materials and questions to the engine", () => {
    for (const t of [
      "Create a PO for 100 bags of OPC 53 cement from Vaigai Traders",
      "raise order for 2 tonnes TMT 12mm",
      "Client paid 2 lakh by UPI today",
      "Add vendor Sri Murugan Hardware 9876543210",
      "add material River sand per cft",
      "How much cement is left?",
      "what is the balance from client",
      "pending orders",
    ]) expect(looksLikeRequest(t), t).toBe(true);
  });

  it("leaves work reports to the daily-log reader", () => {
    for (const t of [
      "Footing concrete 45% done, 20 bags cement, 4 masons, 6 helpers",
      "Column shuttering completed on grid A",
      "Plastering 2nd floor 60%",
    ]) expect(looksLikeRequest(t), t).toBe(false);
  });

  it("ignores commands and one-word replies", () => {
    expect(looksLikeRequest("/log")).toBe(false);
    expect(looksLikeRequest("ok")).toBe(false);
    expect(looksLikeRequest("")).toBe(false);
  });
});
