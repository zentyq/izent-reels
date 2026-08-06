import ffmpegStatic from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { writeFileSync, readFileSync } from "fs";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
  console.log("Using ffmpeg at:", ffmpegStatic);
}

// create a dummy 1 second video
ffmpeg()
  .input('color=c=black:s=320x240:d=1')
  .inputFormat('lavfi')
  .outputOptions('-c:v libx264')
  .output('dummy.mp4')
  .on('end', () => {
    console.log("Dummy video created. Now trimming...");
    trimVideo();
  })
  .on('error', (err) => {
    console.error("Error creating dummy video:", err.message);
  })
  .run();

function trimVideo() {
  ffmpeg('dummy.mp4')
    .setDuration(0.5)
    .outputOptions('-c:v copy')
    .output('dummy_trimmed.mp4')
    .on('end', () => {
      console.log("Trim successful!");
    })
    .on('error', (err) => {
      console.error("Trim error:", err.message);
    })
    .run();
}
