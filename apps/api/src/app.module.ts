import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { databaseProviders } from "./database.provider.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { BackendModule } from "./modules/backend.module.js";

@Module({
  imports: [BackendModule, AiModule],
  controllers: [AppController],
  providers: [...databaseProviders],
  exports: [...databaseProviders],
})
export class AppModule {}
