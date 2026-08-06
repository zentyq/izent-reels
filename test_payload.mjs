import fetch from "node-fetch";

async function test() {
  const dummyPayload = {
    data: {
      videoBase64: "A".repeat(5 * 1024 * 1024), // 5MB
      mimeType: "video/mp4",
      startTime: 0,
      duration: 1
    }
  };

  const res = await fetch("http://localhost:8080/_server/?_serverFnId=editVideo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(dummyPayload)
  });

  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text.slice(0, 500));
}

test();
