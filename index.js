export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Worker ready");
    }

    try {
      const body = await request.json();
      const now = new Date();

      console.log("RAW BODY:", JSON.stringify(body, null, 2));

      const firstName = body.first_name || body.firstName || "";
      const lastName = body.last_name || body.lastName || "";
      const city = body.city || "";
      const state = body.state || "";
      const postalCode = body.postal_code || body.postalCode || body.zip || "";
      const country = body.country || "US";

      let fullAddress = "";

      if (body.address) {
        fullAddress = body.address.trim();
      } else if (body.address1 && body.address1.includes(",")) {
        fullAddress = body.address1.trim();
      } else {
        fullAddress = [
          body.address1 || "",
          city,
          state,
          postalCode,
          country
        ].filter(Boolean).join(", ");
      }

      console.log("Address fields received:", {
        address: body.address,
        address1: body.address1,
        city,
        state,
        postal_code: body.postal_code,
        country,
        fullAddress
      });

      /* =========================================
         GET GEOCODE FROM ADDRESS
      ========================================= */
      let latitude = "";
      let longitude = "";
      let geoLocation = "";
      let geoUnder100 = "No";

      if (fullAddress) {
        try {
          const geo = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullAddress)}&format=json&limit=1`,
            {
              headers: {
                "User-Agent": "SummitGroupLeadSystem"
              }
            }
          );

          const gdata = await geo.json();
          console.log("Forward geocode response:", gdata);

          if (gdata && gdata.length > 0) {
            latitude = gdata[0].lat;
            longitude = gdata[0].lon;
          }

          console.log("Geocoded lat/lon:", latitude, longitude);
        } catch (err) {
          console.log("Geocode failed:", err);
        }
      }

      /* =========================================
         GET ZILLOW DATA
      ========================================= */
      let zestimate = "";
      let status = "";

      const streetOnly = (body.address1 || body.address || "")
        .replace(/,\s*USA$/i, "")
        .trim();

      const zillowAddress = [streetOnly, city, state, postalCode]
        .filter(Boolean)
        .join(", ");

      console.log("Zillow lookup address:", zillowAddress);

      if (zillowAddress) {
        try {
          const zillow = await fetch(
            `https://zllw-working-api.p.rapidapi.com/byaddress?propertyaddress=${encodeURIComponent(zillowAddress)}`,
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

      /* =========================================
         GEO LOCATION + CITY / STATE / COUNTY
      ========================================= */
      if (latitude && longitude) {
        try {
          const geo = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            {
              headers: {
                "User-Agent": "SummitGroupLeadSystem"
              }
            }
          );

          const gdata = await geo.json();
          console.log("Reverse geocode response:", gdata);

          const geoCity =
            gdata.address?.city ||
            gdata.address?.town ||
            gdata.address?.village ||
            gdata.address?.hamlet ||
            gdata.address?.suburb ||
            "";

          const geoState = gdata.address?.state || "";
          const geoCounty =
            gdata.address?.county ||
            gdata.address?.neighbourhood ||
            gdata.address?.suburb ||
            "";

          geoLocation = `${geoCity}, ${geoState}, ${geoCounty}`
            .replace(/^,\s*/, "")
            .replace(/,\s*,/g, ", ")
            .replace(/,\s*$/, "")
            .trim();
        } catch (err) {
          console.log("Geo lookup failed:", err);
        }

        for (const metro of majorCities) {
          const dist = distanceMiles(
            Number(latitude),
            Number(longitude),
            metro.lat,
            metro.lon
          );

          if (dist <= 100) {
            geoUnder100 = "Yes";
            break;
          }
        }
      }

      console.log("FINAL GEO:", {
        fullAddress,
        latitude,
        longitude,
        geoLocation,
        geoUnder100
      });

      const ip =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for") ||
        "";

      const userAgent = request.headers.get("user-agent") || "";

      const row = [
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" }), // Date
        firstName, // First Name
        lastName, // Last Name
        fullAddress, // Address
        body.phone || "", // PhoneNumber
        body.email || "", // Email
        "", // G
        "", // H
        "", // I
        "", // J
        "", // K
        "", // Motivation Scale
        "", // Disposition
        "", // Deal Spread
        "", // Contract Date
        "", // Notes
        body.motivation || "", // Motivation
        body.asking_price || "", // AskingPrice
        body.listed || "", // Listed
        zestimate, // Zestimate
        status, // Status
        geoLocation, // Geolocation
        geoUnder100, // Geo <100
        body.fb_event_name || "Lead", // FB_Event_Name
        body.fb_event_time || now.toISOString(), // FB_Event_Time
        body.fb_value || "", // FB_Value
        body.fb_currency || "USD", // FB_Currency
        body.fb_sent || "", // FB_Sent
        city, // City
        state, // State
        postalCode, // Postal Code
        country, // Country
        body.fbclid || "", // FBCLID
        body.fbc || "", // FBC
        body.fbp || "", // FBP
        body.utm_source || "", // utm_source
        body.utm_campaign_name || "", // utm_campaign_name
        body.utm_campaign || "", // utm_campaign
        body.utm_adgroup || "", // utm_adgroup
        body.utm_ad || "", // utm_ad
        body.utm_term || "", // utm_term
        body.utm_device || "", // utm_device
        ip, // IP
        userAgent, // User Agent
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
          body: JSON.stringify({ values: [row] })
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
      console.error("Worker Error:", err);
      return new Response(err.toString(), { status: 500 });
    }
  }
};

/* ===============================
   SMS ALERT
=============================== */
const name = `${firstName} ${lastName}`.trim();
const phone = body.phone || "";
const email = body.email || "";
const address = fullAddress || "";
const message = body.message || body.notes || "";

const smsBody =
`🏠 New Summit Group Facebook Lead

Address: ${address}
Name: ${name}
Phone: ${phone}
Email: ${email}
Message: ${message}`;

const auth = btoa(
  `${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`
);

const alertNumbers = [
  "+19139577764",
  "+13149549428",
  "+19136895770"
];

for (const to of alertNumbers) {
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        To: to,
        MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE,
        Body: smsBody
      })
    }
  );
}

/* =========================================
   MAJOR U.S. METRO AREAS
========================================= */
const majorCities = [
  { name: "New York", lat: 40.7128, lon: -74.0060 },
  { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
  { name: "Chicago", lat: 41.8781, lon: -87.6298 },
  { name: "Dallas", lat: 32.7767, lon: -96.7970 },
  { name: "Houston", lat: 29.7604, lon: -95.3698 },
  { name: "Washington", lat: 38.9072, lon: -77.0369 },
  { name: "Miami", lat: 25.7617, lon: -80.1918 },
  { name: "Philadelphia", lat: 39.9526, lon: -75.1652 },
  { name: "Atlanta", lat: 33.7490, lon: -84.3880 },
  { name: "Boston", lat: 42.3601, lon: -71.0589 },
  { name: "Phoenix", lat: 33.4484, lon: -112.0740 },
  { name: "San Francisco", lat: 37.7749, lon: -122.4194 },
  { name: "Riverside", lat: 33.9806, lon: -117.3755 },
  { name: "Detroit", lat: 42.3314, lon: -83.0458 },
  { name: "Seattle", lat: 47.6062, lon: -122.3321 },
  { name: "Minneapolis", lat: 44.9778, lon: -93.2650 },
  { name: "San Diego", lat: 32.7157, lon: -117.1611 },
  { name: "Tampa", lat: 27.9506, lon: -82.4572 },
  { name: "Denver", lat: 39.7392, lon: -104.9903 },
  { name: "Baltimore", lat: 39.2904, lon: -76.6122 },
  { name: "St Louis", lat: 38.6270, lon: -90.1994 },
  { name: "Charlotte", lat: 35.2271, lon: -80.8431 },
  { name: "Orlando", lat: 28.5383, lon: -81.3792 },
  { name: "San Antonio", lat: 29.4241, lon: -98.4936 },
  { name: "Portland", lat: 45.5152, lon: -122.6784 },
  { name: "Sacramento", lat: 38.5816, lon: -121.4944 },
  { name: "Pittsburgh", lat: 40.4406, lon: -79.9959 },
  { name: "Las Vegas", lat: 36.1699, lon: -115.1398 },
  { name: "Austin", lat: 30.2672, lon: -97.7431 },
  { name: "Cincinnati", lat: 39.1031, lon: -84.5120 },
  { name: "Kansas City", lat: 39.0997, lon: -94.5786 },
  { name: "Columbus", lat: 39.9612, lon: -82.9988 },
  { name: "Indianapolis", lat: 39.7684, lon: -86.1581 },
  { name: "Cleveland", lat: 41.4993, lon: -81.6944 },
  { name: "San Jose", lat: 37.3382, lon: -121.8863 },
  { name: "Nashville", lat: 36.1627, lon: -86.7816 },
  { name: "Virginia Beach", lat: 36.8529, lon: -75.9780 },
  { name: "Providence", lat: 41.8240, lon: -71.4128 },
  { name: "Milwaukee", lat: 43.0389, lon: -87.9065 },
  { name: "Jacksonville", lat: 30.3322, lon: -81.6557 },
  { name: "Memphis", lat: 35.1495, lon: -90.0490 },
  { name: "Richmond", lat: 37.5407, lon: -77.4360 },
  { name: "Louisville", lat: 38.2527, lon: -85.7585 },
  { name: "Oklahoma City", lat: 35.4676, lon: -97.5164 },
  { name: "Raleigh", lat: 35.7796, lon: -78.6382 },
  { name: "Salt Lake City", lat: 40.7608, lon: -111.8910 },
  { name: "Birmingham", lat: 33.5186, lon: -86.8104 },
  { name: "Buffalo", lat: 42.8864, lon: -78.8784 },
  { name: "Grand Rapids", lat: 42.9634, lon: -85.6681 },
  { name: "Bridgeport", lat: 41.1792, lon: -73.1894 },
  { name: "Tucson", lat: 32.2226, lon: -110.9747 },
  { name: "Fresno", lat: 36.7378, lon: -119.7871 },
  { name: "Hartford", lat: 41.7658, lon: -72.6734 },
  { name: "Omaha", lat: 41.2565, lon: -95.9345 },
  { name: "El Paso", lat: 31.7619, lon: -106.4850 },
  { name: "Greenville", lat: 34.8526, lon: -82.3940 },
  { name: "Albuquerque", lat: 35.0844, lon: -106.6504 },
  { name: "Tulsa", lat: 36.1540, lon: -95.9928 },
  { name: "Knoxville", lat: 35.9606, lon: -83.9207 },
  { name: "Bakersfield", lat: 35.3733, lon: -119.0187 },
  { name: "Boise", lat: 43.6150, lon: -116.2023 },
  { name: "Dayton", lat: 39.7589, lon: -84.1916 },
  { name: "Des Moines", lat: 41.5868, lon: -93.6250 },
  { name: "Madison", lat: 43.0731, lon: -89.4012 },
  { name: "Spokane", lat: 47.6588, lon: -117.4260 },
  { name: "Little Rock", lat: 34.7465, lon: -92.2896 },
  { name: "Akron", lat: 41.0814, lon: -81.5190 },
  { name: "Toledo", lat: 41.6528, lon: -83.5379 },
  { name: "Columbia", lat: 34.0007, lon: -81.0348 },
  { name: "Charleston", lat: 32.7765, lon: -79.9311 }
];

/* =========================================
   DISTANCE CALCULATOR
========================================= */
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* GOOGLE ACCESS TOKEN */
async function getAccessToken(env) {
  const jwt = await createJWT(env);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const data = await res.json();
  return data.access_token;
}

/* CREATE JWT */
async function createJWT(env) {
  const header = { alg: "RS256", typ: "JWT" };
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
