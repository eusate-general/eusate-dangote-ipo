import { describe, expect, it } from "vitest";
import { redactPii } from "@/lib/redact";

describe("redactPii", () => {
  it("removes an 11-digit BVN or NIN", () => {
    const r = redactPii("my bvn is 22334455667 please help");
    expect(r.text).not.toContain("22334455667");
    expect(r.redactions.id).toBe(1);
  });

  it("removes Nigerian phone numbers in local and international form", () => {
    expect(redactPii("call 08031234567").text).not.toContain("08031234567");
    expect(redactPii("call +2348031234567").text).not.toContain("8031234567");
  });

  it("removes a valid card number but leaves a non-Luhn digit run alone", () => {
    const card = redactPii("card 4111 1111 1111 1111");
    expect(card.text).not.toContain("4111");
    expect(card.redactions.card).toBe(1);

    const notACard = redactPii("reference 1234 5678 9012 3456");
    expect(notACard.redactions.card).toBeUndefined();
  });

  it("removes emails and 10-digit account numbers", () => {
    const r = redactPii("mail me at ada@example.com, account 0123456789");
    expect(r.text).not.toContain("ada@example.com");
    expect(r.text).not.toContain("0123456789");
  });

  it("removes OTPs, PINs and passwords that contain a digit", () => {
    expect(redactPii("my otp is 482913").text).not.toContain("482913");
    expect(redactPii("pin: 1234").text).not.toContain("1234");
    expect(redactPii("password=Abc12345!").text).not.toContain("Abc12345");
  });

  it("leaves ordinary questions and amounts untouched", () => {
    for (const q of [
      "What is an OTP?",
      "Should I share my pin with the platform?",
      "I want to invest ₦5,250 for 10 shares",
      "I have 5250000 naira",
      "The offer is at ₦525 per share",
    ]) {
      const r = redactPii(q);
      expect(r.text).toBe(q);
      expect(r.changed).toBe(false);
    }
  });
});
