import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const filter = "[0:v]drawtext=fontfile='C\\\\:/Windows/Fonts/arial.ttf':text='Hello'[v_text]";

let command = ffmpeg("test_input.mp4");
command.complexFilter([filter]);

let currentVideoPad = "v_text";
let currentAudioPad = "0:a";

command.outputOptions([`-map [${currentVideoPad}]`]);
if (currentAudioPad) {
  if (currentAudioPad.includes(":")) {
    command.outputOptions([`-map ${currentAudioPad}?`]);
  } else {
    command.outputOptions([`-map [${currentAudioPad}]`]);
  }
}

command.output("test_output3.mp4")
  .on('start', cmd => console.log('CMD:', cmd))
  .on('error', err => console.log('ERROR:', err.message))
  .on('end', () => console.log('DONE'))
  .run();
