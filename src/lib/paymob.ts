import { createHmac, timingSafeEqual } from "node:crypto";

export type TransactionObject = {
  amount_cents?: string | number;
  created_at?: string;
  currency?: string;
  error_occured?: boolean;
  has_parent_transaction?: boolean;
  id?: string | number;
  integration_id?: string | number;
  is_3d_secure?: boolean;
  is_auth?: boolean;
  is_capture?: boolean;
  is_refunded?: boolean;
  is_standalone_payment?: boolean;
  is_voided?: boolean;
  order?: { id?: string | number; merchant_order_id?: string };
  owner?: string | number;
  pending?: boolean;
  source_data?: { pan?: string | number; sub_type?: string; type?: string };
  success?: boolean;
};

function callbackFields(obj: TransactionObject) {
  return [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    obj.order?.id,
    obj.owner,
    obj.pending,
    obj.source_data?.pan,
    obj.source_data?.sub_type,
    obj.source_data?.type,
    obj.success,
  ];
}

export function isValidTransactionHmac(
  obj: TransactionObject,
  secret: string,
  receivedHmac: string,
) {
  if (!secret || !/^[a-f0-9]{128}$/i.test(receivedHmac)) return false;

  const payload = callbackFields(obj).map(String).join("");
  const expected = createHmac("sha512", secret).update(payload).digest("hex");

  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(receivedHmac, "hex"));
}

export function checkoutUrl(baseUrl: string, publicKey: string, clientSecret: string) {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(clientSecret)}`;
}

export type IntentionInput = {
  amountPiasters: number;
  currency: string;
  paymentMethods: number[];
  specialReference: string;
  customer: { firstName: string; lastName: string; email: string; phone: string };
  items: { name: string; amount: number; quantity: number; description?: string }[];
  extras?: Record<string, string>;
  notificationUrl: string;
  redirectionUrl: string;
};

export async function createIntention(
  input: IntentionInput,
  env: { baseUrl: string; secretKey: string },
) {
  const response = await fetch(`${env.baseUrl.replace(/\/$/, "")}/v1/intention/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${env.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountPiasters,
      currency: input.currency,
      payment_methods: input.paymentMethods,
      items: input.items,
      special_reference: input.specialReference,
      billing_data: {
        first_name: input.customer.firstName,
        last_name: input.customer.lastName,
        email: input.customer.email,
        phone_number: input.customer.phone,
        apartment: "NA",
        floor: "NA",
        street: "NA",
        building: "NA",
        shipping_method: "NA",
        postal_code: "NA",
        city: "Cairo",
        state: "Cairo",
        country: "EGY",
      },
      customer: {
        first_name: input.customer.firstName,
        last_name: input.customer.lastName,
        email: input.customer.email,
      },
      extras: input.extras ?? { merchant_order_id: input.specialReference },
      notification_url: input.notificationUrl,
      redirection_url: input.redirectionUrl,
    }),
  });

  const body = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(body) as Record<string, unknown>;
  } catch {
    data = { raw: body };
  }

  if (!response.ok) {
    const detail = String(data.detail ?? body);
    const integrationHint = response.status === 404
      ? " Check the Test Card Integration ID (PAYMOB_INTEGRATION_ID_CARD) in Test mode under Settings → Payment Integrations."
      : "";
    throw new Error(`Paymob Intention failed (${response.status}): ${detail}.${integrationHint}`);
  }

  return {
    id: String(data.id ?? ""),
    clientSecret: String(data.client_secret ?? ""),
  };
}

export async function inquireByMerchantOrderId(
  merchantOrderId: string,
  env: { baseUrl: string; apiKey: string },
) {
  const base = env.baseUrl.replace(/\/$/, "");
  const auth = await fetch(`${base}/api/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: env.apiKey }),
  });
  if (!auth.ok) {
    throw new Error(`Paymob inquiry auth failed (${auth.status})`);
  }
  const { token } = (await auth.json()) as { token?: string };
  if (!token) throw new Error("Paymob inquiry auth returned no token");

  const order = await fetch(
    `${base}/api/ecommerce/orders?merchant_order_id=${encodeURIComponent(merchantOrderId)}&token=${encodeURIComponent(token)}`,
  );
  if (!order.ok) {
    throw new Error(`Paymob inquiry failed (${order.status})`);
  }
  return order.json();
}
