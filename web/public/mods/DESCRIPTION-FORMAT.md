# HTML DLC descriptions

## Language filename codes

Use uppercase codes exactly (case matters on Linux hosting). These are web mod
conventions, mapped to all 45 original language IDs, including unfinished entries.
Lookup: `description.CODE.html`, then `description.html`. Unknown IDs use `EN`.
An explicit manifest `descriptionFile` overrides language lookup.
Old `zh-CN`, `zh-TW`, and lowercase `en` filenames are no longer used.

| ID | Language | Code |
|---|---|---|
|1|English US / International|EN|
|2|English UK|ENG|
|3|Spanish (Iberian)|ES|
|4|Spanish (Latin American)|ESL|
|5|French|FR|
|6|Portuguese (European)|PT|
|7|Portuguese (Brazilian)|PTB|
|8|German|DE|
|9|Icelandic|IS|
|10|Romanian|RO|
|11|Polish|PL|
|12|Turkish|TR|
|13|Dutch|NL|
|14|Russian|RU|
|15|Malay|MS|
|16|Danish|DA|
|17|Finnish|FI|
|18|Simplified Chinese|ZHS|
|19|Traditional Chinese|ZHT|
|20|Korean|KO|
|21|Greek|EL|
|22|Norwegian|NO|
|23|Lithuanian|LT|
|24|Swedish|SV|
|25|Latvian|LV|
|26|Latin|LA|
|27|Vietnamese|VI|
|28|Filipino (Tagalog)|TL|
|29|Esperanto|EO|
|30|Japanese|JA|
|31|Italian|IT|
|32|Indonesian|ID|
|33|Hungarian|HU|
|34|Estonian|ET|
|35|Serbian|SR|
|36|Croatian|HR|
|37|Singlish|SGL|
|38|Pirate English|PIR|
|39|1337|LET|
|40|SWAG|SWG|
|41|Hillbilly / Redneck|HBR|
|42|Basque|EU|
|43|Catalan|CA|
|44|Thai|TH|
|45|Czech|CS|

## Format

Use UTF-8 description.CODE.html, with description.html as fallback.
Markdown and JSON descriptions are no longer loaded. The title is part of your
HTML: the game does not insert a title when description content exists.
Without description content, the selected mod name is shown.

```html
<h1 style="text-align:center;border:1px solid">My DLC</h1>
<p>Description with <strong>bold</strong> and <em>italic</em> text.</p>
<ul><li>Feature one</li><li>Feature two</li></ul>
<ol><li>First step</li><li>Second step</li></ol>
<blockquote>Important note</blockquote>
<hr>
<figure>
  <img src="images/preview.png" alt="Preview unavailable">
  <figcaption>Optional visible caption</figcaption>
</figure>
```

Supported presentation: h1-h6, p, div, section, article, strong/b, em/i,
ul/ol/li, blockquote, br, hr, img, figure and figcaption. Text entities are decoded.
Supported block styles: text-align:left/center/right and border (game-controlled
one-pixel color). Nested bold and italic can be combined.
Image alt text appears only if the image cannot be displayed (failed load,
invalid path or rejected dimensions). Use figcaption for a persistent caption.
This is a safe HTML subset rendered into the game canvas, not a full webpage.
Arbitrary CSS, scripts, events, iframes, forms, media, SVG and external resources
are not executed or embedded. Links are plain text. Unknown wrappers contribute
only their text content. Do not use tables or layout CSS.

Images are relative to the mod folder and fit within 258 x 160 logical pixels,
without enlargement, preserving aspect ratio. Absolute/remote paths and parent
traversal are rejected. The pane scrolls independently and retains bottom padding.
Limits: 100000 HTML characters, 100 blocks, nesting depth 32, image 32 million pixels.
