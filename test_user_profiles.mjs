const API_KEY = "01C91BB6-EFEF4F45-99566E9D-F3C73F18";
const profileKey = "2BA6D738-453C456C-97EA50E9-879481B3";

console.log("Fetching /user for profile:", profileKey);

const res = await fetch("https://api.ayrshare.com/api/user", {
  method: "GET",
  headers: {
    "Authorization": `Bearer ${API_KEY}`,
    "Profile-Key": profileKey,
    "Content-Type": "application/json"
  }
});

const data = await res.json();
console.log("Status:", res.status);
console.log("Data:", JSON.stringify(data, null, 2));
