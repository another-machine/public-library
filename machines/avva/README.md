# AVVA

One machine turns music into color, the other color into music. Point them at
each other, and then get in-between.

**AVVA now lives at [another-machine/avva](https://github.com/another-machine/avva),
and is served at [avva.amplib.app](https://avva.amplib.app).**

It outgrew a machine directory. Every other machine here is a static Parcel
build that the deploy workflow drops into a subdirectory of the site; AVVA has a
WebSocket relay and a second controller app, so it cannot be one. It was never
in the workflow and never deployed from here — which is why it needed a
subdomain of its own rather than a path on `amplib.app`. Nothing here forwards,
because `amplib.app/avva` never existed to break.

This directory stays because its URL has been shared and because deleting it
would only turn a link into a 404. The Parcel stub that used to sit alongside
this file is gone — it was an empty entry point that never ran.

Parts of it were harvested into packages first, and those are still here:

| Package                                              | What came from AVVA                                          |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| [`@amplib/sound-synthesis`](../../packages/amplib-sound-synthesis) | FM voice, tier backends, drums, layers, worklets, audio graph |
| [`@amplib/hue-wheel`](../../packages/amplib-hue-wheel)             | Perceptual hue mapping and the slot wheel                     |
| [`@amplib/music-theory`](../../packages/amplib-music-theory)       | `parseChord`, the letter-notation chord parser                |

Older versions, from before either of those, are at
[ja-k-e/avva](https://github.com/ja-k-e/avva).
