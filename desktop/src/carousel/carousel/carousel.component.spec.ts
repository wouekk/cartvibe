import { CommonModule } from "@angular/common";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatButtonModule } from "@angular/material/button";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { PipesModule } from "src/pipes/pipes.module";
import { ButtonModule } from "../../button";
import { CarouselComponent } from "./carousel.component";

describe("CarouselComponent", () => {
  let component: CarouselComponent;
  let fixture: ComponentFixture<CarouselComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CarouselComponent],
      imports: [
        CommonModule,
        PipesModule,
        MatButtonModule,
        AppIconComponent,
        ButtonModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CarouselComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
