// The picture shown when a page of the site is shared (og:image, twitter:image) and the image in the home page's JSON-LD:
// the demo Dashboard in day mode, cut to 1200 x 630 PNG at build time (the size and format every network accepts).
import { getImage } from "astro:assets";
import dashboard from "../assets/shots/dashboard-desktop-light.webp";

export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;
export const SOCIAL_IMAGE_ALT = "The CartVibe Dashboard: a month's household spending against a monthly goal, and spending by category";

/** The absolute URL of the social image for a site origin (Astro.site). */
export async function socialImageUrl(site: URL | undefined): Promise<string> {
  const image = await getImage({
    src: dashboard,
    width: SOCIAL_IMAGE_WIDTH,
    height: SOCIAL_IMAGE_HEIGHT,
    fit: "cover",
    position: "top",
    format: "png",
  });
  return new URL(image.src, site).href;
}
