import { Injectable } from "@angular/core";
import { catchError, firstValueFrom, of } from "rxjs";
import { AppInitService } from "../services/app-init.service";

/**
 * Signs the sample user in before the first screen: the demo has no login. It loads the same AppData a real sign-in
 * returns, so the store, permissions and menus are built by the app's own code.
 */
@Injectable({ providedIn: "root" })
export class DemoAppInitService extends AppInitService {
  public override async initAppData(): Promise<boolean> {
    await firstValueFrom(this.getAppData().pipe(catchError(() => of([]))));
    return true;
  }
}
