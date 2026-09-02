import type { OutboxEvent } from "#shared";
import { Redis as Valkey } from "iovalkey";
import type { MemoryDataStore } from "../platform/data-store.js";
import { nowIso } from "../platform/data-store.js";
import { safeOutboxLastError } from "./safe-error.js";

export interface StreamPublisher {
  publish(stream: string, event: OutboxEvent): Promise<void>;
}

export class MemoryStreamPublisher implements StreamPublisher {
  readonly events: OutboxEvent[] = [];

  async publish(_stream: string, event: OutboxEvent): Promise<void> {
    this.events.push(event);
  }
}

export class ValkeyStreamPublisher implements StreamPublisher {
  private readonly valkey: Valkey;

  constructor(valkeyUrl: string) {
    this.valkey = new Valkey(valkeyUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2
    });
  }

  async publish(stream: string, event: OutboxEvent): Promise<void> {
    await this.valkey.connect().catch((error: unknown) => {
      if (error instanceof Error && /already connecting|already connected/iu.test(error.message)) {
        return;
      }
      throw error;
    });
    await this.valkey.xadd(
      stream,
      "*",
      "event_id",
      event.event_id,
      "aggregate_type",
      event.aggregate_type,
      "aggregate_id",
      event.aggregate_id,
      "event_type",
      event.event_type,
      "payload",
      JSON.stringify(event.payload),
      "idempotency_key",
      event.idempotency_key
    );
  }

  close(): void {
    this.valkey.disconnect();
  }
}

export class OutboxWorker {
  constructor(
    private readonly store: MemoryDataStore,
    private readonly publisher?: StreamPublisher
  ) {
    if (!publisher && store.kind !== "memory") {
      throw new Error("A ValkeyStreamPublisher is required for non-memory outbox workers.");
    }
  }

  async publishPending(limit = 100): Promise<{ published: number; dead_lettered: number }> {
    const publisher = this.publisher ?? new MemoryStreamPublisher();
    if (this.store.pgPool && this.store.kind === "postgres") {
      return this.publishPendingFromPostgres(publisher, limit);
    }

    let published = 0;
    let deadLettered = 0;
    const pending = this.store.outbox
      .filter((event) => event.status === "pending" || event.status === "retry")
      .slice(0, limit);

    for (const event of pending) {
      try {
        const consumerKey = `valkey-stream-publisher:${event.event_id}`;
        if (!this.store.processedEvents.has(consumerKey)) {
          await publisher.publish(`hrms.${event.aggregate_type}`, event);
          this.store.processedEvents.add(consumerKey);
        }
        event.status = "published";
        event.published_at = nowIso();
        event.failed_at = null;
        event.last_error = null;
        published += 1;
      } catch (error) {
        event.retry_count += 1;
        event.last_error = safeOutboxLastError(error);
        event.failed_at = nowIso();
        if (event.retry_count >= 5) {
          event.status = "dead_letter";
          deadLettered += 1;
        } else {
          event.status = "retry";
        }
      }
    }

    await this.store.persistence?.flush();
    return { published, dead_lettered: deadLettered };
  }

  private async publishPendingFromPostgres(
    publisher: StreamPublisher,
    limit: number
  ): Promise<{ published: number; dead_lettered: number }> {
    const client = await this.store.pgPool!.connect();
    let published = 0;
    let deadLettered = 0;
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT *
         FROM platform.outbox_events
         WHERE status IN ('pending', 'retry')
           AND available_at <= now()
         ORDER BY available_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        [limit]
      );

      for (const row of rows) {
        const event = rowToEvent(row);
        try {
          await publisher.publish(`hrms.${event.aggregate_type}`, event);
          await client.query(
            `UPDATE platform.outbox_events
             SET status = 'published', published_at = now(), failed_at = NULL, last_error = NULL
             WHERE id = $1`,
            [event.id]
          );
          published += 1;
        } catch (error) {
          const retryCount = event.retry_count + 1;
          const deadLetter = retryCount >= 5;
          await client.query(
            `UPDATE platform.outbox_events
             SET status = $2, retry_count = $3, failed_at = now(), last_error = $4,
                 available_at = CASE WHEN $2 = 'retry' THEN now() + interval '15 seconds' ELSE available_at END
             WHERE id = $1`,
            [event.id, deadLetter ? "dead_letter" : "retry", retryCount, safeOutboxLastError(error)]
          );
          if (deadLetter) {
            deadLettered += 1;
          }
        }
      }
      await client.query("COMMIT");
      await this.store.persistence?.reload();
      return { published, dead_lettered: deadLettered };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function rowToEvent(row: Record<string, unknown>): OutboxEvent {
  return {
    id: Number(row.id),
    event_id: String(row.event_id),
    aggregate_type: String(row.aggregate_type),
    aggregate_id: String(row.aggregate_id),
    event_type: String(row.event_type),
    payload: row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {},
    idempotency_key: String(row.idempotency_key),
    status: row.status as OutboxEvent["status"],
    retry_count: Number(row.retry_count),
    available_at: iso(row.available_at),
    created_at: iso(row.created_at),
    published_at: nullableIso(row.published_at),
    failed_at: nullableIso(row.failed_at),
    last_error: row.last_error === null || row.last_error === undefined ? null : String(row.last_error)
  };
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}
