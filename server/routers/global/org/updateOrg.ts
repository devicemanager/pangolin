import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '@server/db';
import { orgs } from '@server/db/schema';
import { eq } from 'drizzle-orm';
import response from "@server/utils/response";
import HttpCode from '@server/types/HttpCode';
import createHttpError from 'http-errors';

const updateOrgParamsSchema = z.object({
  orgId: z.string().transform(Number).pipe(z.number().int().positive())
});

const updateOrgBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  domain: z.string().min(1).max(255).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update"
});

export async function updateOrg(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = updateOrgParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          parsedParams.error.errors.map(e => e.message).join(', ')
        )
      );
    }

    const parsedBody = updateOrgBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          parsedBody.error.errors.map(e => e.message).join(', ')
        )
      );
    }

    const { orgId } = parsedParams.data;
    const updateData = parsedBody.data;

    const updatedOrg = await db.update(orgs)
      .set(updateData)
      .where(eq(orgs.orgId, orgId))
      .returning();

    if (updatedOrg.length === 0) {
      return next(
        createHttpError(
          HttpCode.NOT_FOUND,
          `Organization with ID ${orgId} not found`
        )
      );
    }

    return res.status(HttpCode.OK).send(
      response({
        data: updatedOrg[0],
        success: true,
        error: false,
        message: "Organization updated successfully",
        status: HttpCode.OK,
      })
    );
  } catch (error) {
    next(error);
  }
}