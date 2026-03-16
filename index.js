export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Worker ready");
    }

    try {
      const body = await request.json();
      const now = new Date();

      console.log("RAW BODY:", JSON.stringify(body, null, 2));

      const firstName = body.first_name || "";
      const lastName = body.last_name || "";
      const phone = body.phone || "";
      const email = body.email || "";
      const city = body.city || "";
      const state = body.state || "";
      const postalCode = body.postal_code || "";
      const country = body.country || "US";

      const street = body.address1 || "";

      const fullAddress = [
        street,
        city,
        state,
        postalCode,
        country
      ].filter(Boolean).join(", ");

      console.log("Address fields received:", {
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        address1: street,
        city,
        state,
        postal_code: postalCode,
        country,
        fullAddress
      });

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

      let zestimate = "";
      let status = "";

      const streetOnly = (body.address1 || "").trim();

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
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
        firstName,
        lastName,
        fullAddress,
        phone,
        email,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        body.motivation || "",
        body.asking_price || "",
        body.listed || "",
        zestimate,
        status,
        geoLocation,
        geoUnder100,
        body.fb_event_name || "Lead",
        body.fb_event_time || now.toISOString(),
        body.fb_value || "",
        body.fb_currency || "USD",
        body.fb_sent || "",
        city,
        state,
        postalCode,
        country,
        body.fbclid || "",
        body.fbc || "",
        body.fbp || "",
        body.utm_source || "",
        body.utm_campaign_name || "",
        body.utm_campaign || "",
        body.utm_adgroup || "",
        body.utm_ad || "",
        body.utm_term || "",
        body.utm_device || "",
        ip,
        userAgent,
        body.url || request.headers.get("referer") || ""
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
