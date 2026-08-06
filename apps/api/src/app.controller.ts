import { Controller, Get } from "@nestjs/common";
import { Public } from "./modules/auth/public.decorator.js";

@Controller()
export class AppController {
  @Get("health")
  @Public()
  health() {
    return { status: "ok", name: "mosaiq-api" };
  }
}
