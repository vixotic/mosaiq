import { Controller, Get, Inject, Query } from "@nestjs/common";
import { SearchService } from "./search.service.js";

const optionalBoolean = (value: string | undefined) =>
  value === "true" ? true : value === "false" ? false : undefined;

@Controller("search")
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query("q") q = "",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("favourite") favourite?: string,
    @Query("reviewed") reviewed?: string,
    @Query("collectionId") collectionId?: string,
  ) {
    const favouriteValue = optionalBoolean(favourite);
    const reviewedValue = optionalBoolean(reviewed);
    return this.searchService.search({
      q,
      ...(page ? { page: Number(page) } : {}),
      ...(pageSize ? { pageSize: Number(pageSize) } : {}),
      ...(favouriteValue === undefined ? {} : { favourite: favouriteValue }),
      ...(reviewedValue === undefined ? {} : { reviewed: reviewedValue }),
      ...(collectionId ? { collectionId } : {}),
    });
  }
}
