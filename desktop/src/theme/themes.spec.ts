import { readFileSync } from "fs";
import { join } from "path";
import { PALETTES } from "./themes";

const THEMES_DIR = join(__dirname, "..", "themes");

interface Block {
  selectors: string[];
  tokens: string[];
}

/** The rule blocks of a palette's stylesheet, comments removed: their selectors and the custom properties they set. */
function blocksOf(file: string): Block[] {
  const css = readFileSync(join(THEMES_DIR, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selectors: selector.split(",").map((part) => part.trim()),
    tokens: [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]).sort(),
  }));
}

const isNight = (block: Block): boolean => block.selectors.every((selector) => selector.startsWith(".dark"));

describe("palette stylesheets (src/themes)", () => {
  const zinc = blocksOf("zinc.css");

  it("import every registered palette, zinc first", () => {
    const imports = [...readFileSync(join(THEMES_DIR, "themes.css"), "utf8").matchAll(/@import "\.\/([a-z]+)\.css"/g)].map(
      (match) => match[1]
    );

    expect(imports.sort()).toEqual(PALETTES.map((palette) => palette.key).sort());
    expect(readFileSync(join(THEMES_DIR, "themes.css"), "utf8").indexOf("zinc.css")).toBeLessThan(
      readFileSync(join(THEMES_DIR, "themes.css"), "utf8").indexOf("stone.css")
    );
  });

  it.each(PALETTES.map((palette) => palette.key))("%s has one day block and one night block with the same tokens", (key) => {
    const blocks = blocksOf(`${key}.css`);
    const day = blocks.filter((block) => !isNight(block));
    const night = blocks.filter(isNight);

    expect(day).toHaveLength(1);
    expect(night).toHaveLength(1);
    expect(night[0].tokens).toEqual(day[0].tokens);
    expect(day[0].tokens).toContain("--primary");
    expect(day[0].tokens).toContain("--primary-foreground");
    expect(day[0].selectors).toContain(`[data-palette="${key}"]`);
    expect(night[0].selectors).toEqual(expect.arrayContaining([`.dark[data-palette="${key}"]`, `.dark [data-palette="${key}"]`]));
  });

  it("only override tokens zinc defines, and write no hex colour (those are zinc's brand tokens)", () => {
    const base = new Set(zinc.flatMap((block) => block.tokens));

    for (const palette of PALETTES.filter((candidate) => candidate.key !== "zinc")) {
      const file = `${palette.key}.css`;
      for (const block of blocksOf(file)) {
        expect(block.tokens.filter((token) => !base.has(token))).toEqual([]);
      }
      expect(readFileSync(join(THEMES_DIR, file), "utf8")).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("zinc defines every token for day and for night, brand colours included", () => {
    const day = zinc.find((block) => !isNight(block));
    const night = zinc.find(isNight);

    expect(night?.tokens).toEqual(day?.tokens);
    expect(day?.tokens).toEqual(expect.arrayContaining(["--background", "--primary", "--ring", "--chart-1", "--sidebar-primary", "--brand-badge-from"]));
  });
});
