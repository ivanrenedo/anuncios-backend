import { Module } from '@nestjs/common';
import { SavedSearchesService } from './saved-searches.service';
import { SavedSearchesResolver } from './saved-searches.resolver';

@Module({
  providers: [SavedSearchesService, SavedSearchesResolver],
  exports: [SavedSearchesService],
})
export class SavedSearchesModule {}
