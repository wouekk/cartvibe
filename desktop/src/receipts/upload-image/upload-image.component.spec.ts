import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { ApiModule } from "../../open-api";
import { ReceiptFileUploadCommand } from "../../interfaces";
import { SnackbarService } from "../../services";
import { ProblemReporter } from "../../services/problem-reporter.service";
import { UploadImageComponent, withKnownType } from "./upload-image.component";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";

describe("UploadImageComponent", () => {
  let component: UploadImageComponent;
  let fixture: ComponentFixture<UploadImageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [ApiModule, UploadImageComponent],
    providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
}).compileComponents();

    fixture = TestBed.createComponent(UploadImageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("a file that is not a photo or a PDF", () => {
    let loaded: ReceiptFileUploadCommand[];
    let error: ReturnType<typeof vi.spyOn>;
    let report: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      loaded = [];
      component.fileLoaded.subscribe((command) => loaded.push(command));
      error = vi.spyOn(TestBed.inject(SnackbarService), "error").mockImplementation(() => undefined);
      report = vi.spyOn(TestBed.inject(ProblemReporter), "report").mockImplementation(() => undefined);
    });

    it("is left out with a word to the person and a line for the server, and the photos beside it still go in", async () => {
      await component.processFiles([
        new File(["a"], "receipt.jpg", { type: "image/jpeg" }),
        new File(["b"], "notes.txt", { type: "text/plain" }),
      ]);

      expect(loaded.map((command) => command.file.name)).toEqual(["receipt.jpg"]);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith("notes.txt was left out: it is not a photo or a PDF.");
      expect(report).toHaveBeenCalledWith("upload-file-left-out", 'name "notes.txt", type "text/plain", 1 bytes');
    });

    it("says nothing when every file is taken", async () => {
      await component.processFiles([new File(["a"], "receipt.png", { type: "image/png" })]);

      expect(loaded).toHaveLength(1);
      expect(error).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    });

    it("takes a photo the phone handed over without a type, by the end of its name", async () => {
      await component.processFiles([new File(["a"], "IMG_20261112_150000.JPG", { type: "" })]);

      expect(loaded.map((command) => command.file.type)).toEqual(["image/jpeg"]);
      expect(error).not.toHaveBeenCalled();
    });

    it("still leaves out a file whose name says nothing either, and says so", async () => {
      await component.processFiles([new File(["a"], "1731412345678", { type: "" })]);

      expect(loaded).toEqual([]);
      expect(error).toHaveBeenCalledWith("1731412345678 was left out: it is not a photo or a PDF.");
      expect(report).toHaveBeenCalledWith("upload-file-left-out", 'name "1731412345678", type "", 1 bytes');
    });
  });

  describe("withKnownType", () => {
    it("keeps a file that says what it is, and names the type of one that does not", () => {
      const typed = new File(["a"], "scan.pdf", { type: "application/pdf" });
      expect(withKnownType(typed)).toBe(typed);

      expect(withKnownType(new File(["a"], "photo.heic", { type: "" })).type).toBe("image/heic");
      expect(withKnownType(new File(["a"], "scan.PDF", { type: "" })).type).toBe("application/pdf");
      expect(withKnownType(new File(["a"], "archive.zip", { type: "" })).type).toBe("");
    });
  });
});
