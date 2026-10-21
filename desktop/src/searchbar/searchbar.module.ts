import { TranslatePipe } from "../i18n/translate.pipe";
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchbarComponent } from './searchbar/searchbar.component';
import { HlmAutocompleteImports } from '@spartan-ng/helm/autocomplete';
import { ReactiveFormsModule } from '@angular/forms';
import { SearchResultPipe } from './pipes/search-result.pipe';

@NgModule({
  declarations: [SearchbarComponent, SearchResultPipe],
  imports: [
    CommonModule,
    TranslatePipe,
    ...HlmAutocompleteImports,
    ReactiveFormsModule,
  ],
  exports: [SearchbarComponent],
})
export class SearchbarModule {}
