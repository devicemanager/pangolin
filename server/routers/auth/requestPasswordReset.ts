import { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import HttpCode from "@server/types/HttpCode";
import { response } from "@server/utils";
import { db } from "@server/db";
import { passwordResetTokens, users } from "@server/db/schema";
import { eq } from "drizzle-orm";
import { sha256 } from "oslo/crypto";
import { encodeHex } from "oslo/encoding";
import { createDate } from "oslo";
import logger from "@server/logger";
import { generateIdFromEntropySize } from "@server/auth";
import { TimeSpan } from "oslo";

export const requestPasswordResetBody = z.object({
    email: z.string().email(),
}).strict();

export type RequestPasswordResetBody = z.infer<typeof requestPasswordResetBody>;

export type RequestPasswordResetResponse = {
    sentEmail: boolean;
};

export async function requestPasswordReset(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<any> {
    const parsedBody = requestPasswordResetBody.safeParse(req.body);

    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString(),
            ),
        );
    }

    const { email } = parsedBody.data;

    try {
        const existingUser = await db
            .select()
            .from(users)
            .where(eq(users.email, email));

        if (!existingUser || !existingUser.length) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "No user with that email exists",
                ),
            );
        }

        await db
            .delete(passwordResetTokens)
            .where(eq(passwordResetTokens.userId, existingUser[0].userId));

        const token = generateIdFromEntropySize(25);
        const tokenHash = encodeHex(
            await sha256(new TextEncoder().encode(token)),
        );

        await db.insert(passwordResetTokens).values({
            userId: existingUser[0].userId,
            tokenHash,
            expiresAt: createDate(new TimeSpan(2, "h")).getTime(),
        });

        // TODO: send email with link to reset password on dashboard
        // something like: https://example.com/auth/reset-password?email=${email}&?token=${token}
        // for now, just log the token
        return response<RequestPasswordResetResponse>(res, {
            data: {
                sentEmail: true,
            },
            success: true,
            error: false,
            message: "Password reset email sent",
            status: HttpCode.OK,
        });
    } catch (e) {
        logger.error(e);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to process password reset request",
            ),
        );
    }
}
