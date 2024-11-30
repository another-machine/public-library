import {
  Destination,
  DestinationInfo,
  DestinationPropertyInput,
} from "../destinations/Destination";

const escapedStringForRegex = (string: string) =>
  string.replace(/([^a-zA-Z\d])/g, "\\$1");

export const COMMANDS = {
  BACK: ["back"],
  HOME: ["home", "exit", "$"],
};

export type PromptOutput = {
  valid: boolean;
  suggestions?: {
    destinationKeys: (string | undefined)[];
    destinationInfos: DestinationInfo[];
    destinations: string[];
    propertyInputs: DestinationPropertyInput[][];
    propertyInputsFormatters: ((values: string[]) => string)[];
    properties: string[];
    commandDescriptions: string[];
    commands: string[];
  };
  info?: DestinationInfo[];
  output?: string[];
};

export class Prompt {
  destination: Destination;
  destinationKeys: string[] = [];
  history: string[] = [];
  historyIndex = 0;
  lastDestinationKey?: string = undefined;

  constructor({ destination }: { destination: Destination }) {
    this.destination = destination;
  }

  get currentDestination(): Destination {
    let obj: Destination = this.destination;
    this.destinationKeys.forEach((key) => {
      if (key in obj.destinations) {
        obj = obj.destinations[key];
      }
    });
    return obj;
  }

  update({ destination }: { destination: Destination }) {
    this.destination = destination;
    this.handleDestination(COMMANDS.HOME[0], []);
  }

  getMatchableRegexForLastToken(string: string): RegExp {
    const commands = string.split(/ +/);
    const command = commands[commands.length - 1] || "";
    return new RegExp(`^(${escapedStringForRegex(command)})`);
  }

  getNextSuggestions(string: string): PromptOutput {
    const [command, ..._args] = string.trim().split(/ +/);
    const matchableCommand = new RegExp(`^${escapedStringForRegex(command)}`);
    const currentDestination = this.currentDestination;
    const {
      key,
      destinations,
      destinationKeys,
      destinationInfos,
      commands,
      commandDescriptions,
      properties,
      propertyInputs,
      propertyInputsFormatters,
    } = currentDestination.suggestions;

    if (this.destinationKeys.length === 0 || key !== undefined) {
      this.lastDestinationKey = key;
    }

    const filteredDestinations = destinations.filter((a) =>
      Boolean(a.match(matchableCommand))
    );
    const filteredDestinationKeys = filteredDestinations.map(
      (key) => destinationKeys[key]
    );
    const filteredDestinationInfos = filteredDestinations.map(
      (key) => destinationInfos[key]
    );
    const filteredCommands = commands.filter((a) =>
      Boolean(a.match(matchableCommand))
    );
    const filteredCommandDescriptions = filteredCommands.map(
      (key) => commandDescriptions[key]
    );
    const filteredProperties = properties.filter((a) =>
      Boolean(a.match(matchableCommand))
    );
    const filteredPropertyInputs = filteredProperties.map(
      (key) => propertyInputs[key]
    );
    const filteredPropertyInputFormatters = filteredProperties.map(
      (key) => propertyInputsFormatters[key]
    );

    const info = [currentDestination.info];
    return {
      valid: true,
      info,
      suggestions: {
        destinationKeys: filteredDestinationKeys,
        destinationInfos: filteredDestinationInfos,
        destinations: filteredDestinations,
        commandDescriptions: filteredCommandDescriptions,
        commands: filteredCommands,
        propertyInputs: filteredPropertyInputs,
        propertyInputsFormatters: filteredPropertyInputFormatters,
        properties: filteredProperties,
      },
    };
  }

  handleCommandString(string: string): PromptOutput {
    this.history.push(string);
    this.historyIndex = this.history.length;
    const [command, ...args] = string.trim().split(/ +/);
    if (!command) {
      return { valid: true };
    }
    return this.handleDestination(command, args);
  }

  handleDestination(command: string, args: string[]): PromptOutput {
    if (COMMANDS.BACK.includes(command)) {
      this.destinationKeys.pop();
      return { valid: true };
    }
    if (COMMANDS.HOME.includes(command)) {
      this.destinationKeys = [];
      return { valid: true };
    }

    const currentDestination = this.currentDestination;
    if (currentDestination.destinations[command]) {
      this.destinationKeys.push(command);
      return { valid: true };
    } else if (currentDestination.properties[command]) {
      const property = currentDestination.properties[command];
      return property.onSet(command, args, this);
    } else if (currentDestination.commands[command]) {
      return currentDestination.commands[command].onCommand(
        command,
        args,
        this
      );
    } else {
      console.log("Command not found:", command, args);
      return { valid: true };
    }
  }

  handleHistory(direction: -1 | 1) {
    if (direction === -1 && this.historyIndex > 0) {
      this.historyIndex--;
      return this.history[this.historyIndex];
    } else if (direction === 1 && this.historyIndex < this.history.length) {
      this.historyIndex++;
      return this.history[this.historyIndex] || "";
    }
    return this.history[this.historyIndex] || "";
  }
}
