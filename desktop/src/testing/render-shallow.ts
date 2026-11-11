import { CUSTOM_ELEMENTS_SCHEMA, SchemaMetadata, Type } from "@angular/core";
import { TestBed } from "@angular/core/testing";

/**
 * Renders a component without its child components. A standalone component brings its real children into a spec;
 * a spec that tests the component's own logic against a mocked store or router does not want them. `keep` lists
 * what the template itself still needs (its pipes, `ReactiveFormsModule`, `NgIf`); every other element is left as
 * an unknown element.
 *
 * Call it in the `beforeEach` before the component is first created. Prefer the real children wherever they
 * render without help: this is for the specs that mock what those children would read.
 */
export function renderShallow(component: Type<unknown>, keep: unknown[] = [], schema: SchemaMetadata = CUSTOM_ELEMENTS_SCHEMA): void {
  TestBed.overrideComponent(component, { set: { imports: keep as Type<unknown>[], schemas: [schema] } });
}
