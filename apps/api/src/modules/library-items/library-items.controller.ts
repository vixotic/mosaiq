import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Query,
} from "@nestjs/common";
import { updateLibraryItemSchema } from "@mosaiq/shared";
import { LibraryItemsService } from "./library-items.service.js";

const bool = (value: string | undefined): boolean | undefined =>
  value === undefined ? undefined : value === "true" ? true : value === "false" ? false : undefined;

@Controller("library-items")
export class LibraryItemsController {
  constructor(@Inject(LibraryItemsService) private readonly items: LibraryItemsService) {}

  @Get()
  list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("favourite") favourite?: string,
    @Query("reviewed") reviewed?: string,
    @Query("direction") direction?: "asc" | "desc",
  ) {
    const favouriteValue = bool(favourite);
    const reviewedValue = bool(reviewed);
    return this.items.list({
      ...(page ? { page: Number(page) } : {}),
      ...(pageSize ? { pageSize: Number(pageSize) } : {}),
      ...(favouriteValue === undefined ? {} : { favourite: favouriteValue }),
      ...(reviewedValue === undefined ? {} : { reviewed: reviewedValue }),
      ...(direction ? { sort: direction } : {}),
    });
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.items.detail(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = updateLibraryItemSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.items.update(id, parsed.data);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.items.softDelete(id);
    return { deleted: true };
  }
}
