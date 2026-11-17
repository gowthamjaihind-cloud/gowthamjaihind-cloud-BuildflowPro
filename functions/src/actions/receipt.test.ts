import { describe, it, expect } from "vitest";
import { paymentDirection, methodOf, cleanPayment, type ReadPayment } from "./receipt";

const vendors = [{ id: "v1", name: "ABC TRADERS" }, { id: "v2", name: "Sri Murugan Steels" }];
const pay = (o: Partial<ReadPayment>): ReadPayment => ({ amount: 144970, date: "2026-11-04", payerName: "", payeeName: "", reference: "", mode: "", ...o });

describe("a payment receipt: who paid whom", () => {
  it("our company paid a vendor -> a vendor payment", () => {
    expect(paymentDirection(pay({ payerName: "B V REALTY", payeeName: "ABC TRADERS" }), "B V Realty", vendors))
      .toEqual({ kind: "vendor", vendorId: "v1", vendorName: "ABC TRADERS" });
    expect(paymentDirection(pay({ payerName: "BV REALTY PVT LTD", payeeName: "SRI MURUGAN STEELS" }), "B V Realty", vendors))
      .toMatchObject({ kind: "vendor", vendorId: "v2" });
  });
  it("our company was paid -> a client payment", () => {
    expect(paymentDirection(pay({ payerName: "Mr Kumar", payeeName: "B V REALTY" }), "B V Realty", vendors)).toEqual({ kind: "client" });
  });
  it("we paid someone who is not a vendor here -> asked, not guessed", () => {
    expect(paymentDirection(pay({ payerName: "B V Realty", payeeName: "New Hardware Mart" }), "B V Realty", vendors))
      .toEqual({ kind: "vendorUnknown", payeeName: "New Hardware Mart" });
    expect(paymentDirection(pay({ payerName: "X", payeeName: "Y" }), "B V Realty", vendors)).toEqual({ kind: "unknown" });
  });
  it("maps the mode and cleans the amount and date", () => {
    expect(methodOf("UPI/PhonePe")).toBe("UPI");
    expect(methodOf("NEFT")).toBe("Bank Transfer");
    expect(methodOf("Cheque 004512")).toBe("Cheque");
    expect(cleanPayment({ amount: "Rs. 1,44,970.00", date: "2027-01-01" }, "2026-11-17")).toMatchObject({ amount: 144970, date: "2026-11-17" });
    expect(cleanPayment({ amount: 0 }, "2026-11-17")).toBeNull();
  });
});
