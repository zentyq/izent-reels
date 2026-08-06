import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const filter = "[0:v]drawtext=fontfile='C\\\\:/Windows/Fonts/arial.ttf':text='Hello'[v_text]";

ffmpeg("test_input.mp4")
  .complexFilter([filter], ["v_text", "0:a"])
  .output("test_output2.mp4")
  .on('start', cmd => console.log('CMD:', cmd))
  .on('error', err => console.log('ERROR:', err.message))
  .on('end', () => console.log('DONE'))
  .run();
