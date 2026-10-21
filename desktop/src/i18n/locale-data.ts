import { registerLocaleData } from "@angular/common";
import localeCs from "@angular/common/locales/cs";
import localeDe from "@angular/common/locales/de";
import localeEs from "@angular/common/locales/es";
import localeFr from "@angular/common/locales/fr";
import localeIt from "@angular/common/locales/it";
import localeNl from "@angular/common/locales/nl";
import localePl from "@angular/common/locales/pl";
import localePt from "@angular/common/locales/pt";
import localeSk from "@angular/common/locales/sk";
import localeUk from "@angular/common/locales/uk";

/**
 * Angular locale data for the languages we can format dates in (en-US is built in). A language outside this set still
 * works: `TranslationService.locale()` falls back to en-US for it, so a date is never blank. To format dates for a
 * language not listed here, add its data below (a few KB each).
 */
const LOCALES: [string, Parameters<typeof registerLocaleData>[0]][] = [
  ["cs", localeCs],
  ["de", localeDe],
  ["es", localeEs],
  ["fr", localeFr],
  ["it", localeIt],
  ["nl", localeNl],
  ["pl", localePl],
  ["pt", localePt],
  ["sk", localeSk],
  ["uk", localeUk],
];

for (const [id, data] of LOCALES) {
  registerLocaleData(data, id);
}
