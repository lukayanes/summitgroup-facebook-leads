export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Worker ready");
    }

    try {
      const body = await request.json();
      const now = new Date();

      const firstName = body.first_name || body.firstName || "";
      const lastName = body.last_name || body.lastName || "";

      const street = body.address1 || body.address || "";
      const city = body.city || "";
      const state = body.state || "";
      const postalCode = body.postal_code || body.postalCode || body.zip || "";
      const country = body.country || "US";

      const fullAddress = [
        street,
        city,
        state,
        postalCode
      ].filter(Boolean).join(", ");

      /* =========================================
         GET ZILLOW DATA
      ========================================= */

      let zestimate = "";
      let status = "";

      if (fullAddress) {
        try {
          const zillow = await fetch(
            `https://zllw-working-api.p.rapidapi.com/byaddress?propertyaddress=${encodeURIComponent(fullAddress)}`,
            {
              method: "GET",
              headers: {
                "x-rapidapi-host": "zllw-working-api.p.rapidapi.com",
                "x-rapidapi-key": env.ZILLOW_KEY
              }
            }
          );

          const zdata = await zillow.json();
          console.log("Zillow response:", zdata);

          const prop = zdata.property || zdata;

          zestimate = prop?.zestimate || "";
          status = prop?.homeStatus || "";
        } catch (err) {
          console.log("Zillow lookup failed:", err);
        }
      }

      const ip =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for") ||
        "";

      const userAgent =
        request.headers.get("user-agent") || "";

 const row = [
  now.toLocaleString(),                         // Date
  firstName,                                   // First Name
  lastName,                                    // Last Name
  fullAddress,                                 // Address
  body.phone || "",                            // PhoneNumber
  body.email || "",                            // Email

  "",                                          // blank col 7
  "",                                          // blank col 8
  "",                                          // blank col 9
  "",                                          // blank col 10
  "",                                          // blank col 11

  "",                                          // Motivation Scale
  "Lead",                                      // Disposition
  "",                                          // Deal Spread
  "",                                          // Contract Date
  "",                                          // Notes

  body.motivation || "",                       // Motivation
  body.asking_price || "",                     // AskingPrice
  body.listed || "",                           // Listed
  zestimate,                                   // Zestimate
  "Lead",                                      // Status
  body.geolocation || "",                      // Geolocation
  body.geo_under_100 || body["geo<100"] || "", // Geo <100
  body.fb_event_name || "Lead",                // FB_Event_Name
  body.fb_event_time || now.toISOString(),     // FB_Event_Time
  body.fb_value || "",                         // FB_Value
  body.fb_currency || "USD",                   // FB_Currency
  body.fb_sent || "",                          // FB_Sent
  city,                                        // City
  state,                                       // State
  postalCode,                                  // Postal Code
  country,                                     // Country
  body.fbclid || "",                           // FBCLID
  body.fbc || "",                              // FBC
  body.fbp || "",                              // FBP
  body.utm_source || "",                       // utm_source
  body.utm_campaign_name || "",                // utm_campaign_name
  body.utm_campaign || "",                     // utm_campaign
  body.utm_adgroup || "",                      // utm_adgroup
  body.utm_ad || "",                           // utm_ad
  body.utm_term || "",                         // utm_term
  body.utm_device || "",                       // utm_device
  ip,                                          // IP
  userAgent,                                   // User Agent
  body.url || request.headers.get("referer") || "" // URL
];

      const token = await getAccessToken(env);

      const sheetsRes = await fetch(
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

      const sheetsData = await sheetsRes.json();

      if (!sheetsRes.ok) {
        return new Response(
          `Sheets API error: ${JSON.stringify(sheetsData)}`,
          { status: 500 }
        );
      }

      return new Response("Success");
    } catch (err) {
      return new Response(err.toString(), { status: 500 });
    }
  }
};

/* GOOGLE ACCESS TOKEN */
async function getAccessToken(env) {
  const jwt = await createJWT(env);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body:
      `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

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

  const unsigned = `${encode(header)}.${encode(payload)}`;

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

  const signed = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${unsigned}.${signed}`;
}

/* FIX PRIVATE KEY FORMAT */
function pemToArrayBuffer(pem) {
  pem = pem.replace(/\\n/g, "\n").trim();

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
