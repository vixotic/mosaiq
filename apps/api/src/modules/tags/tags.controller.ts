import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import { TagsService } from "./tags.service.js";

@Controller("library-items/:itemId")
export class TagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}

  @Post("tags")
  add(@Param("itemId") itemId: string, @Body() body: unknown) {
    const parsed = z
      .object({ label: z.string().min(1).max(200) })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.tags.add(itemId, parsed.data.label);
  }

  @Delete("tags/:tagId")
  async remove(@Param("itemId") itemId: string, @Param("tagId") tagId: string) {
    await this.tags.remove(itemId, tagId);
    return { removed: true };
  }

  @Patch("ai-tags/:tagId")
  dismiss(@Param("itemId") itemId: string, @Param("tagId") tagId: string, @Body() body: unknown) {
    const parsed = z.object({ dismissed: z.boolean() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.tags.dismiss(itemId, tagId, parsed.data.dismissed);
  }
}
