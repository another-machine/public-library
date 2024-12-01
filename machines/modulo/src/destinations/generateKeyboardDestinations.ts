import { Clock } from "../Clock";
import { Destinations } from "./Destinations";
import { Keyboard } from "../Keyboard";
import { Machine } from "../Machine";
import { Destination, DestinationProperty } from "./Destination";
import {
  synthsCommands,
  synthProperties,
  synthDestinations,
  synthVolumeProperty,
  themeSelectorProperty,
} from "./synthUtilities";
import { formatJSON, validators } from "./utilities";

export function generateKeyboardDestinations({
  keys,
  machine,
  clock: _clock,
}: {
  keys: Keyboard;
  machine: Machine;
  clock: Clock;
}): { [destination: string]: Destination } {
  const destinations: { [destination: string]: Destination } = {};
  destinations.keys = new Destination({
    key: keys.theme.toString(),
    info: {
      content: () => formatJSON(keys.exportParams()),
    },
    destinations: {
      main: new Destination({
        info: {
          content: () => formatJSON(keys.main.exportParams(), 4),
        },
        properties: { ...synthVolumeProperty(() => keys.main) },
        destinations: {
          a: new Destination({
            info: {
              content: () => formatJSON(keys.main.exportParams().settings.a),
            },
            commands: synthsCommands(keys.main, true, false),
            properties: synthProperties(keys.main, true, false),
            destinations: synthDestinations(keys.main, true, false),
          }),
          b: new Destination({
            info: {
              content: () => formatJSON(keys.main.exportParams().settings.b),
            },
            commands: synthsCommands(keys.main, false, true),
            properties: synthProperties(keys.main, false, true),
            destinations: synthDestinations(keys.main, false, true),
          }),
        },
      }),
      ghosts: new Destination({
        info: {
          content: () => formatJSON(keys.ghosts.exportParams(), 4),
        },
        properties: { ...synthVolumeProperty(() => keys.ghosts) },
        destinations: {
          a: new Destination({
            info: {
              content: () => formatJSON(keys.ghosts.exportParams().settings.a),
            },
            commands: synthsCommands(keys.ghosts, true, false),
            properties: synthProperties(keys.ghosts, true, false),
            destinations: synthDestinations(keys.ghosts, true, false),
          }),
          b: new Destination({
            info: {
              content: () => formatJSON(keys.ghosts.exportParams().settings.b),
            },
            commands: synthsCommands(keys.ghosts, false, true),
            properties: synthProperties(keys.ghosts, false, true),
            destinations: synthDestinations(keys.ghosts, false, true),
          }),
        },
      }),
    },
    properties: {
      octave: new DestinationProperty({
        inputs: [
          {
            type: "range",
            min: 0,
            max: 7,
            step: 1,
            initialValue: () => keys.octave.toString(),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.octave(value);
          if (valid) {
            keys.octave = parseInt(value);
          }
          return { valid };
        },
      }),
      ...themeSelectorProperty(
        machine,
        (value) => (keys.theme = value),
        () => keys.theme.toString()
      ),
    },
  });
  return destinations;
}
