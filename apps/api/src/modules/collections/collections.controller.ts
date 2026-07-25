import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { CollectionsService } from "./collections.service.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).nullable().optional(),
});
const patchSchema = createSchema.partial().refine((value) => Object.keys(value).length > 0);

@Controller("collections")
export class CollectionsController {
  constructor(@Inject(CollectionsService) private readonly collections: CollectionsService) {}

  @Get()
  list() {
    return this.collections.list();
  }

  @Post()
  create(@Body() body: unknown) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.collections.create({
      name: parsed.data.name,
      ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
    });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.collections.update(id, {
      ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
      ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
    });
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.collections.remove(id);
    return { deleted: true };
  }

  @Get(":id/items")
  items(
    @Param("id") id: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.collections.itemsPage(
      id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 30,
    );
  }

  @Post(":id/items")
  addItems(@Param("id") id: string, @Body() body: unknown) {
    const parsed = z
      .object({ libraryItemIds: z.array(z.string().uuid()).min(1).max(500) })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.collections.addItems(id, parsed.data.libraryItemIds);
  }

  @Delete(":id/items/:itemId")
  async removeItem(@Param("id") id: string, @Param("itemId") itemId: string) {
    await this.collections.removeItem(id, itemId);
    return { removed: true };
  }
}
