# @amplib/devices

Thin wrappers over the browser APIs for hardware a machine wants to listen to:
MIDI controllers, the motion and orientation sensors, the camera and microphone,
and the GPS.

```ts
import { MIDI, type MIDIEvent } from "@amplib/devices";

const midi = new MIDI({
  onEvent: (event: MIDIEvent) => {
    if (event.type === "noteon") console.log(event.a?.value, event.b?.ratio);
  },
});

await midi.initialize(); // prompts for MIDI access
midi.notifyAll(new Uint8Array([0x90, 60, 127])); // to every output
```

## Modules

| Module              | Description                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| `MIDI`              | Connects every input and output, and keeps up as devices come and go    |
| `MIDIEvent`         | One decoded message — channel, type, and up to two described data bytes |
| `DeviceMovement`    | `devicemotion`, behind the iOS permission prompt                       |
| `DeviceOrientation` | `deviceorientation` — `absolute`, `alpha`, `beta`, `gamma`             |
| `UserMediaStream`   | `getUserMedia` plus the device list, split into audio and video inputs  |
| `Geolocation`       | `Geolocation.get()` — the current coordinates, as a promise             |

## Design

**Raw MIDI bytes are described, not just delivered.** `MIDIEvent` decodes a
status byte into a `type` and a channel, and turns each of the two data bytes
into an `EventData` carrying `value` (0–127), `ratio` (0–1) and its own `type`.
Reading `event.b?.ratio` to get a fader position is the point — the alternative
is every consumer rewriting the same mask-and-divide against the spec.

**Connection changes arrive as events too.** `MIDI` subscribes to `statechange`
and adds or drops ports as they appear, so unplugging a controller mid-set does
not leave a dead entry in `inputs`. A connect or disconnect reaches the same
`onEvent` handler as a note, with a null channel.

**Initialization is always explicit.** `MIDI`, `DeviceMovement` and
`DeviceOrientation` each have an `initialize()` separate from their constructor,
because each one triggers a permission prompt — MIDI access, and
`requestPermission()` for the sensors on iOS. Constructing is cheap and silent;
you choose when the user gets asked.

## Requirements

Browser only. Every module reaches for `navigator` and there is no Node build.
`DeviceMovement`, `DeviceOrientation`, `UserMediaStream` and `Geolocation` all
require a secure context, so they work over `https://` and on `localhost` and
nowhere else.

Web MIDI is not universally implemented. Where it is missing,
`navigator.requestMIDIAccess` is undefined and `MIDI.initialize()` rejects
rather than degrading — guard the call if a controller is optional to your app.

The published types reference `MIDIPort` and `MIDIMessageEvent`, which live in
TypeScript's DOM lib rather than in a separate `@types` package. A consumer
compiling without `"lib": ["DOM"]` will not resolve them.
