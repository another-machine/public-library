# @amplib/photography

A long exposure a browser cannot take, assembled from the frames it can read —
then developed.

```ts
import { Camera, Darkroom, defaultParams } from "@amplib/photography";

const camera = new Camera({ facingMode: "environment" });
const darkroom = new Darkroom(canvas);
const params = defaultParams();

await camera.start(); // prompts for the camera
await darkroom.expose(camera.video, {
  frames: 8, // ≈267ms at 30fps
  stack: "mean",
  mirror: camera.mirrored,
  keepNegative: true, // hold the burst so frames/stack can restack
});

darkroom.develop(params); // params include trail — develop-time, not capture
darkroom.restack({ frames: 4 }); // the shutter closing earlier, after the fact
const blob = await darkroom.toBlob();
```

## Modules

| Module            | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `Camera`          | A camera to photograph with — viewfinder, granted frame rate, shutter |
| `Darkroom`        | Stacks frames into an exposure, then develops it                     |
| `SCHEMA`          | Every parameter described, including when it stops applying          |
| `defaultParams`   | The documented defaults, as one object                               |
| `inertReason`     | Why a parameter is being ignored right now, or null                  |

## Design

**Shutter speed is a frame count.** `getUserMedia` exposes no exposure-time
control, so the only long exposure available is an assembled one: read N
consecutive frames and add them together. Eight frames at 30fps is 267ms of
movement and 267ms of light, and because sensor noise is uncorrelated between
frames while the signal is not, it also arrives about a third cleaner. `Camera`
reports `shutterMs(frames)` because that is the number a photographer wants,
and `fps` is read back from the track rather than assumed — asking a camera to
run at 15fps is a request, and Safari in particular declines it.

**Two ways to stack, and they are different photographs.** `mean` sums frames by
weight, so a moving subject spreads its light over everywhere it went and dims
in proportion — motion blur. `max` keeps the brightest value each pixel ever
reached, so a moving light holds full intensity along its entire path — a light
trail. Neither is a post-process of the other.

**Trail is a develop parameter, because the math allows it.** The trail weight
is linear in a frame's position along the burst, so the accumulator keeps two
moments — the weighted sum and the position-weighted sum — and any trail value
is a per-pixel mix of the two at resolve time. Nothing about the trail is
burned into the capture: it drags live like every other develop slider, and
the negative range is free — `-1` makes trails lead instead of follow, a
mirrored ramp the burned-in weighting could never express.

**The negative is optional, because it costs real memory.** With
`keepNegative: true` the burst itself stays on the GPU — 4 bytes per pixel per
frame — and `restack({ frames?, stack? })` re-accumulates from it: fewer
frames is the shutter closing earlier, and `mean`/`max` swap on the same
light. Only the light is unrepeatable. The next expose frees it.

**Exposing and developing share one GL context, because they must.** The
accumulation stays on the GPU as a float texture and the develop chain samples
it directly. Handing it between two contexts would cost a full readback per
shot and, worse, would clip everything above 1.0 — which is exactly the range
halation is made of, since a neon sign clips flat in an 8-bit camera frame and
has to be pushed back up before it can bloom.

**Every kernel is a fraction of the image, not a count of texels.** That is what
makes `develop(params, 0.5)` a preview rather than a different picture: the
whole chain runs at half size and the result is the same photograph, smaller. A
UI can render at half resolution while a slider moves and commit to full
resolution on release, and the two agree. `toBlob` and `toDataURL` re-develop at
full resolution first if the last render was a preview, because saving the
half-size version is never what was meant.

**Parameters carry their own applicability.** `trail` weights later frames more
heavily, which means nothing under `max` — there is no per-frame weight there to
bias. Left as a plain options object that control stays live and does nothing,
which reads as a bug in the renderer rather than a property of the mode. So
`inert` sits next to the parameter it constrains, returns the reason as a string
meant to be shown, and both a UI and a headless caller consult the same rule.
The same mechanism covers the halation tints when halation is off and the split
hues when split is zero.

**The camera comes from @amplib/devices.** `CameraStream` already solves
acquiring, enumerating, cycling, and — the part that bites — stopping the
previous tracks so the indicator light goes out. `Camera` adds only what a
photograph needs and a stream has no opinion about: an element to sample,
mirroring for a front-facing lens, the granted frame rate, and shutter time.

**A burst that cannot finish honestly does not finish.** `expose` rejects with an
`AbortError` rather than returning a torn image if the source changes size
mid-burst (a device turn, which would otherwise stitch two orientations into one
frame), if its `signal` aborts, or if the page is hidden — a backgrounded tab
stops producing frames, and stacking the same stale one eight times yields
something that looks like a photograph instead of like a failure.
`requestVideoFrameCallback` is raced against a timeout for the same reason: a
stalled stream never fires it, and an unraced await would hang with the shutter
open and no way back.

**Rotation is renegotiated, not corrected.** Uploading the video element captures
exactly the frame the viewfinder shows, so the two cannot disagree. What breaks
on a device turn is a platform that keeps handing out landscape frames while the
device is portrait — visible in the preview too — so `Camera` restarts the
stream rather than rotating after the fact. The rotation direction cannot be
derived reliably from the orientation angle alone, and a wrong guess is worse
than a restart.

## Stacking stills

`exposeFrames` takes an array of anything the GPU can upload, for a burst that is
not coming from a live camera — bracketed stills, or frames pulled out of a
decoded video.

```ts
darkroom.exposeFrames([img1, img2, img3], { frames: 3, stack: "max" });
```

## Requirements

WebGL2, and a secure context for the camera. Without
`EXT_color_buffer_float` the pipeline still runs on 8-bit targets and
`darkroom.floatTargets` is false — highlights then clip at 1.0 and halation
loses most of its bite.
