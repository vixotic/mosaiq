import { Module } from "@nestjs/common";
import { databaseProviders } from "../database.provider.js";
import { AssetsController } from "./assets/assets.controller.js";
import { CollectionsController } from "./collections/collections.controller.js";
import { CollectionsService } from "./collections/collections.service.js";
import { LibraryItemsController } from "./library-items/library-items.controller.js";
import { LibraryItemsService } from "./library-items/library-items.service.js";
import { SearchController } from "./search/search.controller.js";
import { SearchService } from "./search/search.service.js";
import { SettingsController } from "./settings/settings.controller.js";
import { SettingsService } from "./settings/settings.service.js";
import { StorageService } from "./storage/storage.service.js";
import { TagsController } from "./tags/tags.controller.js";
import { TagsService } from "./tags/tags.service.js";
import { UploadsController } from "./uploads/uploads.controller.js";
import { UploadsService } from "./uploads/uploads.service.js";

@Module({
  controllers: [
    AssetsController,
    CollectionsController,
    LibraryItemsController,
    SearchController,
    SettingsController,
    TagsController,
    UploadsController,
  ],
  providers: [
    ...databaseProviders,
    CollectionsService,
    LibraryItemsService,
    SearchService,
    SettingsService,
    StorageService,
    TagsService,
    UploadsService,
  ],
  exports: [LibraryItemsService, StorageService],
})
export class BackendModule {}
