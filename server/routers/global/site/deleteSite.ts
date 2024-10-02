import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '@server/db';
import { sites } from '@server/db/schema';
import { eq } from 'drizzle-orm';
import response from "@server/utils/response";
import HttpCode from '@server/types/HttpCode';
import createHttpError from 'http-errors';

// Define Zod schema for request parameters validation
const deleteSiteSchema = z.object({
  siteId: z.string().transform(Number).pipe(z.number().int().positive())
});

export async function deleteSite(req: Request, res: Response, next: NextFunction) {
  try {
    // Validate request parameters
    const parsedParams = deleteSiteSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          parsedParams.error.errors.map(e => e.message).join(', ')
        )
      );
    }

    const { siteId } = parsedParams.data;

    // Delete the site from the database
    const deletedSite = await db.delete(sites)
      .where(eq(sites.siteId, siteId))
      .returning();

    if (deletedSite.length === 0) {
      return next(
        createHttpError(
          HttpCode.NOT_FOUND,
          `Site with ID ${siteId} not found`
        )
      );
    }

    return res.status(HttpCode.OK).send(
      response({
        data: null,
        success: true,
        error: false,
        message: "Site deleted successfully",
        status: HttpCode.OK,
      })
    );
  } catch (error) {
    next(error);
  }
}