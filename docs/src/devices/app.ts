import {
  DeviceMovement,
  DeviceOrientation,
  MIDI,
  UserMediaStream,
} from "../../../packages/amplib-devices/src";

import { createForm } from "../createForm";

export async function example() {
  const sectionOrientation = document.querySelector("#example-orientation")!;
  const outputOrientation = sectionOrientation.querySelector(
    `[data-output="orientation-result"]`
  )!;
  const orientation = new DeviceOrientation({
    handler: (data) => {
      outputOrientation.innerHTML = JSON.stringify(data, null, 2);
    },
  });

  createForm({
    form: sectionOrientation.querySelector("form")!,
    inputs: {},
    onInput: () => {},
    actions: [
      {
        action: (button) => {
          orientation.initialize();
          button.disabled = true;
        },
        name: "initialize()",
      },
    ],
  });

  const sectionMovement = document.querySelector("#example-movement")!;
  const outputMovement = sectionMovement.querySelector(
    `[data-output="movement-result"]`
  )!;
  const movement = new DeviceMovement({
    handler: (data) => {
      outputMovement.innerHTML = JSON.stringify(data, null, 2);
    },
  });

  createForm({
    form: sectionMovement.querySelector("form")!,
    inputs: {},
    onInput: () => {},
    actions: [
      {
        action: (button) => {
          movement.initialize();
          button.disabled = true;
        },
        name: "initialize()",
      },
    ],
  });

  const sectionMIDI = document.querySelector("#example-midi")!;
  const outputMIDI = sectionMIDI.querySelector(`[data-output="midi-result"]`)!;
  const midi = new MIDI({
    onEvent: (data) => {
      outputMIDI.innerHTML = JSON.stringify(data, null, 2);
    },
  });

  createForm({
    form: sectionMIDI.querySelector("form")!,
    inputs: {},
    onInput: () => {},
    actions: [
      {
        action: (button) => {
          midi.initialize();
          button.disabled = true;
        },
        name: "initialize()",
      },
    ],
  });

  const sectionUserMediaStream = document.querySelector(
    "#example-userMediaStream"
  )!;
  const outputUserMediaStream = sectionUserMediaStream.querySelector(`figure`)!;
  const userMediaStream = new UserMediaStream();

  createForm({
    form: sectionUserMediaStream.querySelector("form")!,
    inputs: {},
    onInput: () => {},
    actions: [
      {
        action: async (button) => {
          button.disabled = true;
          const stream = await userMediaStream.start({
            audio: true,
            video: true,
          });
          const video = document.createElement("video");
          video.srcObject = stream;
          video.muted = true;
          video.autoplay = true;
          video.controls = true;
          outputUserMediaStream.appendChild(video);
        },
        name: "await start()",
      },
    ],
  });
}
