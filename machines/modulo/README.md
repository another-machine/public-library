# Modulo

A skinnable step sequencer with a command prompt.

**Modulo now lives at [another-machine/modulo](https://github.com/another-machine/modulo),
and is served at [modulo.amplib.app](https://modulo.amplib.app).**

It left because it could not stay in place. Every machine here imports its
siblings by relative source path — `../../../packages/amplib-*/src` — which
only resolves inside this repo. Moving it out forced those three imports onto
npm, and publishing them is what made the move possible:

| Package                                                        | Used for                                |
| -------------------------------------------------------------- | --------------------------------------- |
| [`@amplib/music-theory`](../../packages/amplib-music-theory)     | scales, modes and notes                 |
| [`@amplib/devices`](../../packages/amplib-devices)               | MIDI in and out                         |
| [`@amplib/steganography`](../../packages/amplib-steganography)   | encoding a patch into a shareable image |

Unlike AVVA, this one *was* in the deploy workflow and *was* served from here,
at `amplib.app/modulo`. That path now forwards rather than 404s — see
[`redirects/modulo`](../../redirects/modulo). This directory stays for the same
reason the redirect does.

An earlier prototype is at [inst.jake.fun](https://inst.jake.fun), and this is
the next version of [arp.jake.fun](https://arp.jake.fun). Older, unrelated work
that once sat at `~/projects/modulo` is at
[ja-k-e/modulo](https://github.com/ja-k-e/modulo).
