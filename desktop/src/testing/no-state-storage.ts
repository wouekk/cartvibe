import { Injectable } from "@angular/core";
import { StateStorage } from "../store/state-storage";

/**
 * What the stores get in specs: nothing is kept, so every test starts from the defaults and leaves nothing behind
 * for the next one. A spec about what the browser keeps provides `StateStorage` itself.
 */
@Injectable()
export class NoStateStorage extends StateStorage {
  public override read(): unknown {
    return undefined;
  }

  public override write(): void {}
}
