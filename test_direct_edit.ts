import { editVideo } from "./src/lib/video.functions";
import { readFileSync, writeFileSync } from "fs";

async function run() {
  const videoBase64 = readFileSync("dummy.mp4").toString("base64");
  
  try {
    const res = await editVideo({
      data: {
        videoBase64,
        mimeType: "video/mp4",
        startTime: 0,
        duration: 0.5
      }
    });
    
    console.log("Result:", res.ok ? "Success" : "Error", res.error);
  } catch(e) {
    console.error("Direct error:", e);
  }
}

run();
