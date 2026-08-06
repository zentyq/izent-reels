import fs from 'fs';
import path from 'path';

const isWindows = process.platform === 'win32';
const filename = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const url = isWindows 
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

const dest = path.join(process.cwd(), filename);

console.log(`Downloading standalone yt-dlp from ${url} to ${dest}...`);

async function download() {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download: ${res.status} ${res.statusText}`);
    }
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    
    if (!isWindows) {
      fs.chmodSync(dest, 0o755); // Make executable on Linux
    }
    console.log('Successfully downloaded and prepared yt-dlp standalone binary!');
  } catch (error) {
    console.error(`Error downloading yt-dlp:`, error);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    process.exit(1);
  }
}

download();
