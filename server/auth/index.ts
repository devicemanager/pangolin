export * from "./verifySession";
export * from "./unauthorizedResponse";

import {
    encodeBase32LowerCaseNoPadding,
    encodeHexLowerCase,
} from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { Session, sessions, User, users } from "@server/db/schema";
import db from "@server/db";
import { eq } from "drizzle-orm";
import config from "@server/config";
import type { RandomReader } from "@oslojs/crypto/random";
import { generateRandomString } from "@oslojs/crypto/random";

export const SESSION_COOKIE_NAME = config.server.session_cookie_name;
export const SESSION_COOKIE_EXPIRES = 1000 * 60 * 60 * 24 * 30;
export const SECURE_COOKIES = config.server.secure_cookies;
export const COOKIE_DOMAIN =
    "." + new URL(config.app.base_url).hostname.split(".").slice(-2).join(".");

export function generateSessionToken(): string {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const token = encodeBase32LowerCaseNoPadding(bytes);
    return token;
}

export async function createSession(
    token: string,
    userId: string,
): Promise<Session> {
    const sessionId = encodeHexLowerCase(
        sha256(new TextEncoder().encode(token)),
    );
    const session: Session = {
        sessionId: sessionId,
        userId,
        expiresAt: new Date(Date.now() + SESSION_COOKIE_EXPIRES).getTime(),
    };
    await db.insert(sessions).values(session);
    return session;
}

export async function validateSessionToken(
    token: string,
): Promise<SessionValidationResult> {
    const sessionId = encodeHexLowerCase(
        sha256(new TextEncoder().encode(token)),
    );
    const result = await db
        .select({ user: users, session: sessions })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.userId))
        .where(eq(sessions.sessionId, sessionId));
    if (result.length < 1) {
        return { session: null, user: null };
    }
    const { user, session } = result[0];
    if (Date.now() >= session.expiresAt) {
        await db
            .delete(sessions)
            .where(eq(sessions.sessionId, session.sessionId));
        return { session: null, user: null };
    }
    if (Date.now() >= session.expiresAt - SESSION_COOKIE_EXPIRES / 2) {
        session.expiresAt = new Date(
            Date.now() + SESSION_COOKIE_EXPIRES,
        ).getTime();
        await db
            .update(sessions)
            .set({
                expiresAt: session.expiresAt,
            })
            .where(eq(sessions.sessionId, session.sessionId));
    }
    return { session, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.sessionId, sessionId));
}

export async function invalidateAllSessions(userId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
}

export function serializeSessionCookie(token: string): string {
    if (SECURE_COOKIES) {
        return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Max-Age=${SESSION_COOKIE_EXPIRES}; Path=/; Secure; Domain=${COOKIE_DOMAIN}`;
    } else {
        return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Max-Age=${SESSION_COOKIE_EXPIRES}; Path=/; Domain=${COOKIE_DOMAIN}`;
    }
}

export function createBlankSessionTokenCookie(): string {
    if (SECURE_COOKIES) {
        return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/; Secure; Domain=${COOKIE_DOMAIN}`;
    } else {
        return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/; Domain=${COOKIE_DOMAIN}`;
    }
}

const random: RandomReader = {
    read(bytes: Uint8Array): void {
        crypto.getRandomValues(bytes);
    },
};

export function generateId(length: number): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    return generateRandomString(random, alphabet, length);
}

export function generateIdFromEntropySize(size: number): string {
    const buffer = crypto.getRandomValues(new Uint8Array(size));
    return encodeBase32LowerCaseNoPadding(buffer);
}

export type SessionValidationResult =
    | { session: Session; user: User }
    | { session: null; user: null };
