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

if (!change) {

return new Response("No lead data", { status: 200 });

}


/* EXTRACT FACEBOOK DATA */

const fields = {};

(change.field_data || []).forEach(field => {

fields[field.name] = field.values[0];

});


const now = new Date();


const row = [

now.toLocaleString(),

fields.full_name || "",

fields.street_address || "",

fields.phone_number || "",

fields.email || "",

"", "", "", "", "", "", "", "",

"Lead",

"", "",

"Lead",

now.toISOString(),

"",

"USD",

"",

"facebook",

"",

change.campaign_name || "",

change.adset_name || "",

change.ad_name || "",

"",

"facebook_lead_form"

];


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



async function createJWT(env) {

const header = {

alg: "RS256",

typ: "JWT"

};


const now = Math.floor(Date.now() / 1000);


const payload = {

iss: env.CLIENT_EMAIL,

scope:

"https://www.googleapis.com/auth/spreadsheets",

aud:

"https://oauth2.googleapis.com/token",

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

btoa(

String.fromCharCode(

...new Uint8Array(signature)

)

)

.replace(/=/g, "")

.replace(/\+/g, "-")

.replace(/\//g, "_");


return `${unsigned}.${signed}`;

}



function pemToArrayBuffer(pem) {

const base64 = pem

.replace("-----BEGIN PRIVATE KEY-----", "")

.replace("-----END PRIVATE KEY-----", "")

.replace(/\n/g, "");


const binary = atob(base64);

const buffer = new ArrayBuffer(binary.length);

const view = new Uint8Array(buffer);


for (let i = 0; i < binary.length; i++) {

view[i] = binary.charCodeAt(i);

}


return buffer;

}
