import { Category, Icon, Tag } from "../open-api";
import { UserPreferences } from "../open-api/model/userPreferences";

export interface AuthStateInterface {
  userId?: string;
  displayname?: string;
  username?: string;
  expirationDate?: string;
  defaultAvatarColor?: string;
  userPreferences?: UserPreferences;
  icons?: Icon[];
  appPermissions?: string[];
  groupPermissions?: { [groupId: number]: string[] };
  // The categories/tags the user may use in each group (keyed by group id): the
  // whole pool for every household they are in. People without the global read
  // permission receive categories/tags only through these maps.
  groupCategories?: { [groupId: number]: Category[] };
  groupTags?: { [groupId: number]: Tag[] };
}
