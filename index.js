export default {
  async fetch(request, env) {

    const VERIFY_TOKEN = env.VERIFY_TOKEN;

    /* FACEBOOK WEBHOOK VERIFICATION */
    if (request.method === "GET") {

      const url = new URL(request.url);

      if (
        url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === VERIFY_TOKEN
      ) {
        return new Response(
          url.searchParams.get("hub.challenge"),
          { status: 200 }
        );
      }

      return new Response("Verification failed", { status: 403 });
    }


    /* FACEBOOK LEAD RECEIVED */
    if (request.method === "POST") {

      try {

        const body = await request.json();

        const change = body.entry?.[0]?.changes?.[0]?.value;

        if (!change?.leadgen_id) {
          return new Response("No leadgen_id", { status: 200 });
        }


        /* FETCH FULL LEAD FROM FACEBOOK */

        const fbRes = await fetch(
          `https://graph.facebook.com/v19.0/${change.leadgen_id}?fields=created_time,ad_name,adset_name,campaign_name,field_data&access_token=${env.FB_ACCESS_TOKEN}`
        );

        const fbData = await fbRes.json();


        /* EXTRACT FIELDS */

        const fields = {};

        (fbData.field_data || []).forEach(field => {
          fields[field.name] = field.values[0];
        });


        const now = new Date();


        const address = [
          fields.street_address,
          fields.city,
          fields.state,
          fields.zip
        ].filter(Boolean).join(", ");



        /* YOUR EXACT SHEET COLUMN ORDER */

        const row = [

          now.toLocaleString(),   // Date

          fields.full_name || "",

          address,

          fields.phone_number || "",

          fields.email || "",

          "", "", "", "", "",

          "",

          "Lead",

          "",

          "",

          "",

          "",

          "",

          "",

          "Lead",

          "",

          "",

          "Lead",

          now.toISOString(),

          "",

          "USD",

          "",

          "facebook",

          fbData.campaign_name || "",

          fbData.campaign_name || "",

          fbData.adset_name || "",

          fbData.ad_name || "",

          "",

          "facebook_lead_form"

        ];


        /* GOOGLE SHEETS AUTH */

        const token = await getAccessToken(env);


        /* APPEND TO SHEET */

        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/A1:append?valueInputOption=USER_ENTERED`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              values: [row]
            })
          }
        );


        return new Response("Success");

      } catch (err) {

        return new Response(err.toString(), { status: 500 });

      }

    }


    return new Response("Invalid");

  }
};




/* GOOGLE ACCESS TOKEN */

async function getAccessToken(env) {

  const jwt = await createJWT(env);

  const res = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body:
        `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    }
  );

  const data = await res.json();

  return data.access_token;

}




/* CREATE JWT */

async function createJWT(env) {

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: env.CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const encode = obj =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");


  const unsigned =
    `${encode(header)}.${encode(payload)}`;


  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.PRIVATE_KEY),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );


  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );


  const signed =
    btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");


  return `${unsigned}.${signed}`;

}




/* FIX PRIVATE KEY FORMAT */

function pemToArrayBuffer(pem) {

  pem = pem.replace(/\\n/g, '\n').trim();

  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");


  const binary = atob(base64);


  const buffer = new ArrayBuffer(binary.length);

  const view = new Uint8Array(buffer);


  for (let i = 0; i < binary.length; i++) {

    view[i] = binary.charCodeAt(i);

  }


  return buffer;

}
