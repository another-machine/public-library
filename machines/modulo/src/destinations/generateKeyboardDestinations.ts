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
} from "./synthUtilities";
import { validators } from "./utilities";

export function generateKeyboardDestinations({
  keyboard,
  machine,
  clock: _clock,
}: {
  keyboard: Keyboard;
  machine: Machine;
  clock: Clock;
}): Destinations {
  const destinations: { [destination: string]: Destination } = {};
  destinations.keyboard = new Destination({
    key: "keyboard",
    info: {
      content: () => Destinations.formatJSON(keyboard.exportParams()),
    },
    destinations: {
      main: new Destination({
        info: {
          content: () =>
            Destinations.formatJSON(keyboard.main.exportParams(), 4),
        },
        properties: { ...synthVolumeProperty(() => keyboard.main) },
        destinations: {
          a: new Destination({
            info: {
              content: () =>
                Destinations.formatJSON(
                  keyboard.main.exportParams().settings.a
                ),
            },
            commands: synthsCommands(keyboard.main, true, false),
            properties: synthProperties(keyboard.main, true, false),
            destinations: synthDestinations(keyboard.main, true, false),
          }),
          b: new Destination({
            info: {
              content: () =>
                Destinations.formatJSON(
                  keyboard.main.exportParams().settings.b
                ),
            },
            commands: synthsCommands(keyboard.main, false, true),
            properties: synthProperties(keyboard.main, false, true),
            destinations: synthDestinations(keyboard.main, false, true),
          }),
        },
      }),
      ghosts: new Destination({
        info: {
          content: () =>
            Destinations.formatJSON(keyboard.ghosts.exportParams(), 4),
        },
        properties: { ...synthVolumeProperty(() => keyboard.ghosts) },
        destinations: {
          a: new Destination({
            info: {
              content: () =>
                Destinations.formatJSON(
                  keyboard.ghosts.exportParams().settings.a
                ),
            },
            commands: synthsCommands(keyboard.ghosts, true, false),
            properties: synthProperties(keyboard.ghosts, true, false),
            destinations: synthDestinations(keyboard.ghosts, true, false),
          }),
          b: new Destination({
            info: {
              content: () =>
                Destinations.formatJSON(
                  keyboard.ghosts.exportParams().settings.b
                ),
            },
            commands: synthsCommands(keyboard.ghosts, false, true),
            properties: synthProperties(keyboard.ghosts, false, true),
            destinations: synthDestinations(keyboard.ghosts, false, true),
          }),
        },
      }),
    },
    properties: {
      octave: new DestinationProperty({
        inputs: [
          {
            type: "number",
            min: 0,
            max: 7,
            initialValue: () => keyboard.octave.toString(),
          },
        ],
        onSet: (_command, [value]) => {
          const valid = validators.octave(value);
          if (valid) {
            keyboard.octave = parseInt(value);
          }
          return { valid };
        },
      }),
    },
  });
  return destinations;
}
