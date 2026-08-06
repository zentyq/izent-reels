import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const input = "test_input.mp4"; // Create a dummy mp4?
const filter = "[0:v]drawtext=fontfile='C\\\\:/Windows/Fonts/arial.ttf':text='Hello':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2[v_text]";

ffmpeg("test_input.mp4")
  .complexFilter([filter])
  .outputOptions(["-map [v_text]"])
  .output("test_output.mp4")
  .on('start', cmd => console.log('CMD:', cmd))
  .on('error', err => console.log('ERROR:', err.message))
  .on('end', () => console.log('DONE'))
  .run();
