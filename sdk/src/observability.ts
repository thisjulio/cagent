export type Attributes = Record<string, string | number | boolean>;

export interface Span {
  id: string;
  setAttribute(name: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: Attributes): void;
  recordException(error: unknown): void;
  end(): void;
}

export interface Observability {
  startSpan(name: string, attributes?: Attributes): Span;
  recordMetric(name: string, value: number, attributes?: Attributes): void;
  recordEvent(name: string, attributes?: Attributes): void;
  flush?(): void;
}

const noopSpan: Span = {
  id: "noop",
  setAttribute: () => undefined,
  addEvent: () => undefined,
  recordException: () => undefined,
  end: () => undefined,
};

export const noopObservability: Observability = {
  startSpan: () => noopSpan,
  recordMetric: () => undefined,
  recordEvent: () => undefined,
};

export type SpanRecord = {
  id: string;
  name: string;
  attributes: Attributes;
  events: { name: string; attributes?: Attributes }[];
  durationMs?: number;
  exception?: string;
};

export type MetricRecord = {
  name: string;
  value: number;
  attributes?: Attributes;
};

export class InMemoryObservability implements Observability {
  readonly spans: SpanRecord[] = [];
  readonly metrics: MetricRecord[] = [];
  readonly events: { name: string; attributes?: Attributes }[] = [];

  startSpan(name: string, attributes: Attributes = {}): Span {
    const id = crypto.randomUUID();
    const record: SpanRecord = { id, name, attributes: { ...attributes }, events: [] };
    const started = performance.now();
    this.spans.push(record);
    return {
      id,
      setAttribute: (key, value) => { record.attributes[key] = value; },
      addEvent: (eventName, eventAttributes) => {
        record.events.push({ name: eventName, attributes: eventAttributes });
      },
      recordException: (error) => {
        record.exception = error instanceof Error ? error.message : String(error);
      },
      end: () => { record.durationMs = performance.now() - started; },
    };
  }

  recordMetric(name: string, value: number, attributes?: Attributes): void {
    this.metrics.push({ name, value, attributes });
  }

  recordEvent(name: string, attributes?: Attributes): void {
    this.events.push({ name, attributes });
  }
}

export async function trace<T>(
  observability: Observability,
  name: string,
  operation: (span: Span) => T | Promise<T>,
  attributes?: Attributes,
): Promise<T> {
  const span = observability.startSpan(name, attributes);
  try {
    return await operation(span);
  } catch (error) {
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}