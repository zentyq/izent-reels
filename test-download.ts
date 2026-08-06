import { downloadMediaFromUrl } from './src/lib/download.functions.js';

async function test() {
  console.log("Testing yt-dlp locally...");
  const result = await downloadMediaFromUrl("https://www.youtube.com/watch?v=pBk8BjA-X4Y");
  if (result.ok) {
    console.log(`SUCCESS! Downloaded file of size ${result.sizeBytes} bytes. Content type: ${result.contentType}`);
  } else {
    console.error("FAILED:", result.error);
  }
}

test();
