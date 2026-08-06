import fs from 'fs';

const API_KEY = "01C91BB6-EFEF4F45-99566E9D-F3C73F18";
const domain = "id-JUrXN";
let privateKey = fs.readFileSync("private.key", "utf-8").trim();

privateKey = privateKey.replace(/\r\n/g, '\n').trim();
privateKey = privateKey.replace("BEGIN PRIVATE KEY", "BEGIN RSA PRIVATE KEY");
privateKey = privateKey.replace("END PRIVATE KEY", "END RSA PRIVATE KEY");

console.log("=== Testing Ayrshare create profile & generateJWT ===");
const title = "Disk Space Fixed Project " + Date.now();
console.log("Creating profile:", title);

const resCreate = await fetch("https://api.ayrshare.com/api/profiles/profile", {
  method: "POST",
  headers: { 
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ title })
});

const createData = await resCreate.json();
if (createData.status === "error") {
  console.log("Failed to create profile:", createData);
  process.exit(1);
}

const profileKey = createData.profileKey;
console.log("Successfully created profileKey:", profileKey);

console.log("--- Test JSON Generate JWT ---");
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
