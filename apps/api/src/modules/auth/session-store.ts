import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { Database } from "@mosaiq/database";
import { ownerSessions } from "@mosaiq/database";
import { DATABASE } from "../../database.provider.js";

export type StoredSession = { id: string; expiresAt: Date };

@Injectable()
export class SessionStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(tokenHash: string, expiresAt: Date): Promise<StoredSession> {
    const [session] = await this.db
      .insert(ownerSessions)
      .values({ tokenHash, expiresAt })
      .returning({ id: ownerSessions.id, expiresAt: ownerSessions.expiresAt });
    if (!session) throw new Error("Session was not created.");
    return session;
  }

  async findActive(tokenHash: string, now: Date): Promise<StoredSession | null> {
    const [session] = await this.db
      .select({ id: ownerSessions.id, expiresAt: ownerSessions.expiresAt })
      .from(ownerSessions)
      .where(
        and(
          eq(ownerSessions.tokenHash, tokenHash),
          isNull(ownerSessions.revokedAt),
          gt(ownerSessions.expiresAt, now),
        ),
      )
      .limit(1);
    return session ?? null;
  }

  async revoke(tokenHash: string, now: Date): Promise<void> {
    await this.db
      .update(ownerSessions)
      .set({ revokedAt: now })
      .where(and(eq(ownerSessions.tokenHash, tokenHash), isNull(ownerSessions.revokedAt)));
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.db.delete(ownerSessions).where(lt(ownerSessions.expiresAt, now));
  }
}
