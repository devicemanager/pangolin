import { ActionsEnum, checkUserActionPermission } from "@server/auth/actions";
import { db } from "@server/db";
import { targets, resources } from "@server/db/schema";
import HttpCode from "@server/types/HttpCode";
import response from "@server/utils/response";
import { eq, sql } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";

const listTargetsParamsSchema = z.object({
    resourceId: z.string()
});

const listTargetsSchema = z.object({
    limit: z
        .string()
        .optional()
        .default("1000")
        .transform(Number)
        .pipe(z.number().int().positive()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.number().int().nonnegative()),
});

function queryTargets(resourceId: string) {
    let baseQuery = db
        .select({
            targetId: targets.targetId,
            ip: targets.ip,
            method: targets.method,
            port: targets.port,
            protocol: targets.protocol,
            enabled: targets.enabled,
            resourceId: targets.resourceId,
            // resourceName: resources.name,
        })
        .from(targets)
        // .leftJoin(resources, eq(targets.resourceId, resources.resourceId))
        .where(eq(targets.resourceId, resourceId));

    return baseQuery;
}

export type ListTargetsResponse = {
    targets: Awaited<ReturnType<typeof queryTargets>>;
    pagination: { total: number; limit: number; offset: number };
};

export async function listTargets(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listTargetsSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error)
                )
            );
        }
        const { limit, offset } = parsedQuery.data;

        const parsedParams = listTargetsParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error)
                )
            );
        }
        const { resourceId } = parsedParams.data;

        // Check if the user has permission to list targets
        const hasPermission = await checkUserActionPermission(
            ActionsEnum.listTargets,
            req
        );
        if (!hasPermission) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not have permission to perform this action"
                )
            );
        }

        const baseQuery = queryTargets(resourceId);

        let countQuery = db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(targets)
            .where(eq(targets.resourceId, resourceId));

        const targetsList = await baseQuery.limit(limit).offset(offset);
        const totalCountResult = await countQuery;
        const totalCount = totalCountResult[0].count;

        return response<ListTargetsResponse>(res, {
            data: {
                targets: targetsList,
                pagination: {
                    total: totalCount,
                    limit,
                    offset,
                },
            },
            success: true,
            error: false,
            message: "Targets retrieved successfully",
            status: HttpCode.OK,
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred..."
            )
        );
    }
}