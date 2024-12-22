import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import {
    resources,
    userResources,
    roleResources,
    resourceAccessToken
} from "@server/db/schema";
import response from "@server/utils/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { sql, eq, or, inArray, and, count, isNull, lt, gt } from "drizzle-orm";
import logger from "@server/logger";
import stoi from "@server/utils/stoi";

const listAccessTokensParamsSchema = z
    .object({
        resourceId: z
            .string()
            .optional()
            .transform(stoi)
            .pipe(z.number().int().positive().optional()),
        orgId: z.string().optional()
    })
    .strict()
    .refine((data) => !!data.resourceId !== !!data.orgId, {
        message: "Either resourceId or orgId must be provided, but not both"
    });

const listAccessTokensSchema = z.object({
    limit: z
        .string()
        .optional()
        .default("1000")
        .transform(Number)
        .pipe(z.number().int().nonnegative()),

    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.number().int().nonnegative())
});

function queryAccessTokens(
    accessibleResourceIds: number[],
    orgId?: string,
    resourceId?: number
) {
    const cols = {
        accessTokenId: resourceAccessToken.accessTokenId,
        orgId: resourceAccessToken.orgId,
        resourceId: resourceAccessToken.resourceId,
        sessionLength: resourceAccessToken.sessionLength,
        expiresAt: resourceAccessToken.expiresAt,
        tokenHash: resourceAccessToken.tokenHash,
        title: resourceAccessToken.title,
        description: resourceAccessToken.description,
        createdAt: resourceAccessToken.createdAt,
        resourceName: resources.name
    };

    if (orgId) {
        return db
            .select(cols)
            .from(resourceAccessToken)
            .leftJoin(
                resources,
                eq(resourceAccessToken.resourceId, resources.resourceId)
            )
            .where(
                and(
                    inArray(
                        resourceAccessToken.resourceId,
                        accessibleResourceIds
                    ),
                    eq(resourceAccessToken.orgId, orgId),
                    or(
                        isNull(resourceAccessToken.expiresAt),
                        gt(resourceAccessToken.expiresAt, new Date().getTime())
                    )
                )
            );
    } else if (resourceId) {
        return db
            .select(cols)
            .from(resourceAccessToken)
            .leftJoin(
                resources,
                eq(resourceAccessToken.resourceId, resources.resourceId)
            )
            .where(
                and(
                    inArray(
                        resourceAccessToken.resourceId,
                        accessibleResourceIds
                    ),
                    eq(resourceAccessToken.resourceId, resourceId),
                    or(
                        isNull(resourceAccessToken.expiresAt),
                        gt(resourceAccessToken.expiresAt, new Date().getTime())
                    )
                )
            );
    }
}

export type ListAccessTokensResponse = {
    accessTokens: NonNullable<Awaited<ReturnType<typeof queryAccessTokens>>>;
    pagination: { total: number; limit: number; offset: number };
};

export async function listAccessTokens(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listAccessTokensSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    parsedQuery.error.errors.map((e) => e.message).join(", ")
                )
            );
        }
        const { limit, offset } = parsedQuery.data;

        const parsedParams = listAccessTokensParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    parsedParams.error.errors.map((e) => e.message).join(", ")
                )
            );
        }
        const { orgId, resourceId } = parsedParams.data;

        if (orgId && orgId !== req.userOrgId) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not have access to this organization"
                )
            );
        }

        const accessibleResources = await db
            .select({
                resourceId: sql<number>`COALESCE(${userResources.resourceId}, ${roleResources.resourceId})`
            })
            .from(userResources)
            .fullJoin(
                roleResources,
                eq(userResources.resourceId, roleResources.resourceId)
            )
            .where(
                or(
                    eq(userResources.userId, req.user!.userId),
                    eq(roleResources.roleId, req.userOrgRoleId!)
                )
            );

        const accessibleResourceIds = accessibleResources.map(
            (resource) => resource.resourceId
        );

        let countQuery: any = db
            .select({ count: count() })
            .from(resources)
            .where(inArray(resources.resourceId, accessibleResourceIds));

        const baseQuery = queryAccessTokens(
            accessibleResourceIds,
            orgId,
            resourceId
        );

        const list = await baseQuery!.limit(limit).offset(offset);
        const totalCountResult = await countQuery;
        const totalCount = totalCountResult[0].count;

        return response<ListAccessTokensResponse>(res, {
            data: {
                accessTokens: list,
                pagination: {
                    total: totalCount,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Access tokens retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
