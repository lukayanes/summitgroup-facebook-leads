export default {
  async fetch(request, env) {

    const VERIFY_TOKEN = env.VERIFY_TOKEN;

    /* FACEBOOK VERIFICATION */
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

      const body = await request.json();

      const change = body.entry?.[0]?.changes?.[0]?.value;

      if (!change?.leadgen_id) {
        return new Response("No leadgen_id", { status: 200 });
      }


      /* FETCH FULL LEAD DATA FROM FACEBOOK */

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



      /* EXACT SHEET COLUMN ORDER */

      const row = [

        now.toLocaleString(),                 // Date

        fields.full_name || "",              // Name

        address,                             // Address

        fields.phone_number || "",          // PhoneNumber

        fields.email || "",                 // Email

        "", "", "", "", "",                // empty cols

        "",                                 // Motivation Scale

        "Lead",                             // Disposition

        "",                                 // Deal Spread

        "",                                 // Contract Date

        "",                                 // Notes

        "",                                 // Motivation

        "",                                 // AskingPrice

        "",                                 // Listed

        "",                                 // Zestimate

        "Lead",                             // Status

        "",                                 // Geolocation

        "",                                 // Geo <100

        "Lead",                             // FB_Event_Name

        now.toISOString(),                  // FB_Event_Time

        "",                                 // FB_Value

        "USD",                              // FB_Currency

        "",                                 // FB_Sent

        "facebook",                         // utm_source

        fbData.campaign_name || "",        // utm_campaign_name

        fbData.campaign_name || "",        // utm_campaign

        fbData.adset_name || "",           // utm_adgroup

        fbData.ad_name || "",              // utm_ad

        "",                                 // IP

        "facebook_lead_form"               // URL

      ];


      /* SEND TO GOOGLE SHEETS */

      const token = await getAccessToken(env);

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

    }

    return new Response("Invalid");

  }
};
