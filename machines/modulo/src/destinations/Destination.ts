import { Prompt, PromptOutput } from "../prompt/Prompt";

export type DestinationInfo = { content: () => string; label?: string };

export type DestinationCommandArgs = {
  description: string;
  onCommand(command: string, args: string[], prompt: Prompt): PromptOutput;
};
export type DestinationPropertyInput =
  | {
      type: "number";
      initialValue: () => string;
      min: number;
      max: number;
      steps?: number[];
      label?: string;
    }
  | {
      type: "range";
      initialValue: () => string;
      min: number;
      max: number;
      step?: number;
      label?: string;
    }
  | {
      type: "select";
      initialValue: () => string;
      options: string[];
      label?: string;
    };

export type DestinationPropertyInputFormatter = (values: string[]) => any;

export type DestinationPropertyArgs = {
  inputs: DestinationPropertyInput[];
  inputsFormatter?: DestinationPropertyInputFormatter;
  onSet(command: string, args: string[], prompt: Prompt): PromptOutput;
};

export class DestinationCommand {
  description: string;
  onCommand: (command: string, args: string[], prompt: Prompt) => PromptOutput;

  constructor({ description, onCommand }: DestinationCommandArgs) {
    this.description = description;
    this.onCommand = onCommand;
  }
}

export class DestinationProperty {
  inputs: DestinationPropertyInput[];
  inputsFormatter: DestinationPropertyInputFormatter;
  onSet: (command: string, args: string[], prompt: Prompt) => PromptOutput;

  constructor({
    inputs,
    inputsFormatter = (values) => values.join(" "),
    onSet,
  }: DestinationPropertyArgs) {
    this.inputs = inputs;
    this.inputsFormatter = inputsFormatter;
    this.onSet = onSet;
  }
}

export class Destination {
  key?: string;
  info: DestinationInfo;
  destinations: { [destination: string]: Destination };
  properties: { [property: string]: DestinationProperty };
  commands: { [command: string]: DestinationCommand };

  constructor({
    key,
    info,
    destinations,
    properties,
    commands,
  }: {
    key?: string;
    info: DestinationInfo;
    destinations?: { [destination: string]: Destination };
    properties?: { [property: string]: DestinationProperty };
    commands?: { [command: string]: DestinationCommand };
  }) {
    this.key = key;
    this.info = info;
    this.destinations = destinations || {};
    this.properties = properties || {};
    this.commands = commands || {};
  }

  get suggestions() {
    const destinations = Object.keys(this.destinations);
    const destinationKeys = destinations.reduce<{
      [k: string]: string | undefined;
    }>((into, key) => {
      into[key] = this.destinations[key].key;
      return into;
    }, {});
    const destinationInfos = destinations.reduce<{
      [k: string]: DestinationInfo;
    }>((into, key) => {
      into[key] = this.destinations[key].info;
      return into;
    }, {});
    const properties = Object.keys(this.properties);
    const propertyInputs = properties.reduce<{
      [k: string]: DestinationPropertyInput[];
    }>((into, key) => {
      into[key] = this.properties[key].inputs;
      return into;
    }, {});
    const propertyInputsFormatters = properties.reduce<{
      [k: string]: DestinationPropertyInputFormatter;
    }>((into, key) => {
      into[key] = this.properties[key].inputsFormatter;
      return into;
    }, {});
    const commands = Object.keys(this.commands);
    const commandDescriptions = commands.reduce<{
      [k: string]: string;
    }>((into, key) => {
      into[key] = this.commands[key].description;
      return into;
    }, {});
    return {
      key: this.key,
      destinations,
      destinationKeys,
      destinationInfos,
      properties,
      propertyInputs,
      propertyInputsFormatters,
      commands,
      commandDescriptions,
    };
  }
}
