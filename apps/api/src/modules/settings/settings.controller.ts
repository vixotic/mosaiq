import { Controller, Get, Inject } from "@nestjs/common";
import { SettingsService } from "./settings.service.js";

@Controller("settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get("status")
  status() {
    return this.settings.status();
  }
}
