# Chrome Web Store — long description (EN)

> Paste into the dashboard's description field (English).

ArticleLens turns any article into a clean, structured summary — a title, a TL;DR, and key
points you can read in seconds. Run the AI entirely on your device for total privacy, or plug in
your favorite cloud provider.

**You choose, from the very first open**
On first open ArticleLens shows you the options — on-device, OpenRouter's free models, or your
paid provider — and downloads nothing until you decide.

**Private by default — local AI**
On-device models run 100% in your browser with WebGPU. The article, the summary, everything
stays on your machine: no servers, no account, no tracking. The model downloads once (~2 GB,
behind an explicit button with the size up front) and is cached for every later run.

**Or bring your own cloud**
Prefer speed or a bigger model? Add your own API key for OpenAI, Anthropic (Claude), or
OpenRouter — including OpenRouter's free models at $0 per token. ArticleLens is always explicit
when a mode sends the article text to a provider, and shows a cost estimate before each cloud
run. Keys are stored only in your browser.

**Built for reading**
• Clean extraction — pulls the real article out of the page, no ads, no nav, no comments
• Structured output — title + TL;DR + key points, scaled to the article's length
• Any length — long reads are summarized chunk by chunk with live progress and cancel
• Side panel UI — the summary lives next to the page, pinned to the tab it came from
• Markdown export — download any summary as a .md file
• Model picker with hardware feasibility — see what your device can run before downloading
• English and Spanish UI

**Permissions, honestly**
ArticleLens asks for page access only when you click Summarize, and only then injects its
reader. It never reads pages in the background. The "browsing history" permission is used for
one thing: noticing you navigated away, so a summary is never attributed to the wrong page.

**Requirements**
Local models need a WebGPU-capable browser (recent Chrome/Edge) and a GPU with ~4 GB of memory
for the default model. Cloud models work on any machine — no WebGPU needed.

Open source: https://github.com/vab1997/article-lens
Website & privacy policy: https://article-lens-web.vercel.app
