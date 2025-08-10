import { MachineParams } from "./Machine";

export class LocalStorage {
  private static readonly STORAGE_KEY = "modulo-machine-state";
  private static readonly VERSION = "1.0.0";

  private static isAvailable(): boolean {
    try {
      const test = "__localStorage_test__";
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  static save(params: MachineParams): void {
    if (!this.isAvailable()) {
      console.warn("localStorage is not available - state will not be saved");
      return;
    }

    try {
      const data = {
        version: this.VERSION,
        timestamp: Date.now(),
        params,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn("Failed to save machine state to localStorage:", error);
    }
  }

  static load(): MachineParams | null {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;

      const data = JSON.parse(stored);

      // Check version compatibility
      if (data.version !== this.VERSION) {
        console.warn(
          `Stored state version ${data.version} doesn't match current version ${this.VERSION}`
        );
        return null;
      }

      return data.params;
    } catch (error) {
      console.warn("Failed to load machine state from localStorage:", error);
      return null;
    }
  }

  static clear(): void {
    if (!this.isAvailable()) {
      return;
    }

    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn("Failed to clear machine state from localStorage:", error);
    }
  }

  static hasStoredState(): boolean {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored !== null;
    } catch {
      return false;
    }
  }
}
