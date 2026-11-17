import { describe, it, expect } from "vitest";
import { normalizeInvoiceJson } from "./invoiceShape";

const bill = { vendorName: "ABC TRADERS", invoiceNumber: "212", grandTotal: 144970, lineItems: [{ name: "Cement", qty: 50 }] };

describe("the model's answer for a bill", () => {
  it("takes the object as it is, in a list, or wrapped", () => {
    expect(normalizeInvoiceJson(bill)).toMatchObject(bill);
    expect(normalizeInvoiceJson([bill])).toMatchObject(bill);
    expect(normalizeInvoiceJson({ invoice: bill })).toMatchObject(bill);
    expect(normalizeInvoiceJson({ invoices: [bill] })).toMatchObject(bill);
  });
  it("returns null when nothing was read, rather than a blank bill", () => {
    expect(normalizeInvoiceJson({ vendorName: "", invoiceNumber: "", grandTotal: 0, lineItems: [] })).toBeNull();
    expect(normalizeInvoiceJson([])).toBeNull();
    expect(normalizeInvoiceJson({ error: "not an invoice" })).toBeNull();
    expect(normalizeInvoiceJson("text")).toBeNull();
  });
});
