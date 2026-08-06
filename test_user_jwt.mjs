import fs from 'fs';

const API_KEY = "01C91BB6-EFEF4F45-99566E9D-F3C73F18";
const domain = "id-JUrXN";
let privateKey = fs.readFileSync("private.key", "utf-8").trim();

privateKey = privateKey.replace(/\r\n/g, '\n').trim();
privateKey = privateKey.replace("BEGIN PRIVATE KEY", "BEGIN RSA PRIVATE KEY");
privateKey = privateKey.replace("END PRIVATE KEY", "END RSA PRIVATE KEY");

const profileKey = "7902FFFC-CB074AFD-B7B08851-A6F019A2";

console.log("--- Testing Profile Key: " + profileKey + " ---");
const res2 = await fetch("https://api.ayrshare.com/api/profiles/generateJWT", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ domain, privateKey, profileKey, allowedSocial: ["tiktok"] }),
});
console.log("Status:", res2.status);
console.log("Response:", await res2.text());
