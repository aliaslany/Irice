import { serializeJsonLd } from "../modules/seo/structured-data";

/** A structured-data script tag, safely serialised — see serializeJsonLd for why. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
