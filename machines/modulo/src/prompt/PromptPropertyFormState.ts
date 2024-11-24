export class PromptPropertyFormState {
  private subscribers: Map<string, Function[]> = new Map();
  private values: Map<string, any> = new Map();

  subscribe(key: string, callback: Function) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    this.subscribers.get(key)?.push(callback);

    if (this.values.has(key)) {
      callback(this.values.get(key));
    }

    return () => this.unsubscribe(key, callback);
  }

  unsubscribe(key: string, callback: Function) {
    const callbacks = this.subscribers.get(key) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  publish(key: string, value: any) {
    this.values.set(key, value);
    const subscribers = this.subscribers.get(key) || [];
    subscribers.forEach((callback) => callback(value));
  }

  getAllValues() {
    return Object.fromEntries(this.values);
  }
}
