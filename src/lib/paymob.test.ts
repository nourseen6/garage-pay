import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutUrl, createIntention, isValidTransactionHmac } from "./paymob";

describe("Paymob transaction callback verification", () => {
  it("accepts a SHA-512 HMAC created from the documented transaction field order", () => {
    const obj = {
      amount_cents: 100,
      created_at: "2020-03-25T18:39:44.719228",
      currency: "EGP",
      error_occured: false,
      has_parent_transaction: false,
      id: 2556706,
      integration_id: 6741,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 4778239 },
      owner: 4705,
      pending: false,
      source_data: { pan: 2346, sub_type: "MasterCard", type: "card" },
      success: true,
    };

    expect(isValidTransactionHmac(obj, "not-a-real-secret", "ce4804d6ebafd53ef369d4828955b68ce68d5cc05af2e8c66e4e2e4b45057a083be2c667c56fbf945ba0dbdda0410a887c53ef6fc41cd23c1f7bff3686489ae9")).toBe(true);
  });

  it("rejects a mismatched HMAC", () => {
    expect(isValidTransactionHmac({} as never, "secret", "bad")).toBe(false);
  });
});

const intentionInput = {
  amountPiasters: 50000,
  currency: "EGP",
  paymentMethods: [5853675],
  specialReference: "job-1",
  customer: {
    firstName: "Ahmed",
    lastName: "Elsayed",
    email: "garagepay@example.com",
    phone: "+201001234567",
  },
  items: [{ name: "GaragePay deposit", amount: 50000, quantity: 1, description: "Elantra" }],
  notificationUrl: "https://example.ngrok-free.app/api/paymob/webhook",
  redirectionUrl: "https://example.ngrok-free.app/api/paymob/return",
};

describe("Paymob Intention client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the Unified Checkout URL from public key and client secret", () => {
    expect(checkoutUrl("https://accept.paymob.com", "egy_pk_test_x", "csk_test_y")).toBe(
      "https://accept.paymob.com/unifiedcheckout/?publicKey=egy_pk_test_x&clientSecret=csk_test_y",
    );
  });

  it("creates an Intention with Token auth and amount in piasters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "int_1", client_secret: "csk_1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createIntention(intentionInput, {
      baseUrl: "https://accept.paymob.com",
      secretKey: "egy_sk_test_x",
    });

    expect(result).toEqual({ id: "int_1", clientSecret: "csk_1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://accept.paymob.com/v1/intention/",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Token egy_sk_test_x",
          "Content-Type": "application/json",
        },
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      amount: number;
      payment_methods: number[];
      billing_data: { phone_number: string };
      special_reference: string;
    };
    expect(body.amount).toBe(50000);
    expect(body.payment_methods).toEqual([5853675]);
    expect(body.billing_data.phone_number).toBe("+201001234567");
    expect(body.special_reference).toBe("job-1");
  });

  it("tells the merchant to check the Test Card Integration ID on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ detail: "Integration ID/Name does not exist" }),
      }),
    );

    await expect(
      createIntention(intentionInput, {
        baseUrl: "https://accept.paymob.com",
        secretKey: "egy_sk_test_x",
      }),
    ).rejects.toThrow(/Test Card Integration ID/);
  });
});
