import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { DateInputDirective, formatDateInput, parseDateInput } from "./date-input.directive";

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, DateInputDirective],
  template: `<input type="date" appDateInput [formControl]="control" />`,
})
class HostComponent {
  public control = new FormControl<Date | null>(new Date(2026, 9, 21));
}

describe("DateInputDirective", () => {
  it("formats a Date by its local calendar day and rejects anything else", () => {
    expect(formatDateInput(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatDateInput(null)).toBe("");
    expect(formatDateInput(new Date("nonsense"))).toBe("");
  });

  it("parses yyyy-MM-dd to a local-midnight Date", () => {
    const date = parseDateInput("2026-10-21");

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(9);
    expect(date?.getDate()).toBe(21);
    expect(date?.getHours()).toBe(0);
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("21/10/2026")).toBeNull();
  });

  it("shows the control's Date and writes a Date back when the user picks a day", async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector("input");

    expect(input.value).toBe("2026-10-21");

    input.value = "2026-11-02";
    input.dispatchEvent(new Event("input"));

    const value = fixture.componentInstance.control.value as Date;
    expect([value.getFullYear(), value.getMonth(), value.getDate()]).toEqual([2026, 10, 2]);

    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(fixture.componentInstance.control.value).toBeNull();
  });
});
