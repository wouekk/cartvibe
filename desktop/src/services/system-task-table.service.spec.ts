import { TestBed } from "@angular/core/testing";

import { SystemTaskTableService } from "./system-task-table.service";

describe("SystemTaskTableService", () => {
  let service: SystemTaskTableService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SystemTaskTableService]
    });
    service = TestBed.inject(SystemTaskTableService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });
});
