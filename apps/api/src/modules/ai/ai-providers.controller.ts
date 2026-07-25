import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { AnalyzerRegistry } from "./analyzer-registry.service.js";

@Controller("ai-providers")
export class AiProvidersController {
  constructor(@Inject(AnalyzerRegistry) private readonly registry: AnalyzerRegistry) {}

  @Get()
  list() {
    return this.registry.statuses();
  }

  @Get(":id/health")
  async health(@Param("id") id: string) {
    try {
      return await this.registry.get(id).healthCheck();
    } catch {
      throw new NotFoundException(`Unknown AI provider "${id}".`);
    }
  }
}
