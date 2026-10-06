---
title: Bluesky Character Limit and Graphemes Explained
slug: bluesky-character-limit-graphemes
excerpt: Bluesky allows 300 graphemes per post, not 300 bytes or code points. Learn what a grapheme is and why emoji and accents behave differently on Bluesky.
seoTitle: Bluesky Character Limit and Graphemes Explained
seoDescription: The Bluesky character limit is 300 graphemes per post. See what graphemes are, how emoji and accents count, and how to stay under the limit every time.
focusKeyword: bluesky character limit
secondaryKeywords: bluesky 300 characters, graphemes explained, bluesky post length
category: Platform Guides
tags: bluesky, graphemes, character limit
readMins: 6
---

The Bluesky character limit is 300 graphemes per post. A grapheme is one user-perceived character, so a letter, a digit or a whole emoji each count as one, even when a computer stores them as several pieces. A post can also carry up to four images. This rule comes from the AT Protocol post lexicon.

## Key takeaways

- The Bluesky character limit is 300 graphemes per post, and a grapheme is what a reader sees as a single character.
- One emoji counts as 1 on Bluesky, which is more generous than X, where most emoji count as 2.
- Bluesky does not count bytes or code points for this limit, so accented letters and combined emoji are not penalised.
- A post can include up to 4 images, and the 300-grapheme limit applies to the text.
- When you reuse a draft written for another platform, recount it for Bluesky, because the same text can be over the limit in one place and under it in another.

## What is a grapheme, and why does Bluesky use it?

A grapheme is a single unit of text as a person perceives it. When you look at the letter "a", the digit "7" or a thumbs-up emoji, you see one character. A grapheme matches that view, which is why Bluesky uses it instead of a technical measure like bytes.

Computers store text in several layers, and the layers can disagree about what "one character" means:

- **Bytes:** the raw storage units. A plain English letter takes 1 byte in UTF-8, while many emoji take 4.
- **Code points:** the numbered entries in the Unicode standard. A simple letter is one code point, but a combined emoji can be several.
- **Graphemes:** what readers perceive as one character. This is the layer Bluesky counts.

Counting graphemes is the friendliest choice for writers. You count what you see. The AT Protocol lexicon, the technical definition that Bluesky's post format follows, sets the post text limit at 300 graphemes.

## How do emoji and accents count on Bluesky?

Each emoji counts as 1 grapheme on Bluesky, even if it is built from several code points. A family emoji is a good example. It is made by joining several person emoji with invisible joiner characters, so it uses many code points and many bytes, but it appears as one symbol and counts as one grapheme.

Accents work the same way. The letter "e" with an acute accent can be stored as one code point or as a plain "e" followed by a separate accent mark. Both look identical and both are one grapheme. A tool that counts code points would give two different totals for text that looks the same. Bluesky's rule avoids that.

This example is a simplified illustration of how Unicode works, not a test of any particular app. The point is that on Bluesky, what you see is what you count.

### How does this compare to other platforms?

The same sentence can have a different count on each platform, because each one measures text differently. Here is how the main text limits compare as of 2026:

| Platform | Text limit | How it counts |
|---|---|---|
| Bluesky | 300 | Graphemes (one emoji = 1) |
| X (standard) | 280 | Weighted (URL = 23, most emoji = 2) |
| Threads | 500 | Emoji count by their UTF-8 byte length in the API |

If you cross-post the same short text to all three, Bluesky and X are the tight ones, and the way they count emoji differs. A post with six emoji uses 6 on Bluesky and 12 on X. That is plain arithmetic from the counting rules above.

## How long is a post under the Bluesky character limit?

300 graphemes is roughly the length of two or three short sentences. The limit rewards tight writing, and it fits a short observation, a link with a one-line reason to click, or the opening of a longer thread.

Because the limit is about the text, images add no characters. A post can carry up to 4 images, and you can use the image to carry detail that would not fit in the text. Add alt text so the image is accessible to everyone who reads your post.

Links deserve a note. On some platforms a link uses a fixed number of characters. For Bluesky, we have not verified a special rule for links, so assume a pasted link uses the characters it contains, and check the count in your composer before you publish.

## How do you write well within 300 graphemes?

Short limits reward a clear structure. Try this order when you draft:

1. **Lead with the point.** State the claim, the news or the question in the first sentence.
2. **Add one supporting detail,** such as a number, a name or a reason.
3. **End with one action,** such as a link, a question or a reply prompt.
4. **Cut adjectives and hedges** before you cut meaning.
5. **Move the extra material** to a reply, a thread or an image.

A thread is a chain of posts in reply to each other. It lets a longer idea unfold across several posts while each one stays inside 300 graphemes. Make each post readable alone, because people often land on the middle of a thread.

### Should you copy your X post to Bluesky?

Sometimes it fits, but check first. A post written to 280 weighted characters on X may be well under 300 graphemes on Bluesky, especially if it uses emoji, because each emoji costs half as much. The reverse is not always true. A Bluesky post at 295 graphemes can easily exceed 280 weighted characters on X, and a link would add 23 to the X count.

Beyond the count, the tone differs. A post that reads like an advertisement tends to feel out of place in a conversational feed. Adjust the wording rather than pasting.

## What happens if a post goes over the Bluesky character limit?

If your text exceeds 300 graphemes, Bluesky will not accept the post as written. You need to shorten it or split it into a thread. A scheduling tool that counts differently from Bluesky may let a draft through that Bluesky later refuses, which is a problem for posts scheduled in advance.

The safest approach is to count the way Bluesky does at the time you write the post, not at the time it goes out. A grapheme-aware counter gives you an accurate total. Many simple counters count code points or bytes, so a draft with emoji may look longer or shorter than it really is.

## Frequently asked questions

### What is the Bluesky character limit?

Bluesky allows 300 graphemes per post, as defined in the AT Protocol post lexicon. A grapheme is one user-perceived character, so a letter, a digit or a whole emoji each count as one.

### Do emoji count as one character on Bluesky?

Yes. Each emoji counts as 1 grapheme on Bluesky, even a combined emoji that a computer stores as several parts. On X, by comparison, most emoji count as 2.

### How many images can a Bluesky post have?

A Bluesky post can include up to 4 images. Images do not use up the 300-grapheme text limit.

### Why is my Bluesky character count different in another tool?

Many tools count bytes or code points instead of graphemes, and those totals can differ from Bluesky's, especially with emoji and accented letters. Use a counter that measures graphemes to match what Bluesky enforces.

## How MultiPost Studio helps

MultiPost Studio measures Bluesky posts in graphemes, the same way Bluesky does, and shows the 300 limit next to the limits for your other channels. You can write a Bluesky version of a post separately and preview it before it publishes. For a quick check of any draft against each platform's limit, the [free character counter](/tools/character-counter) needs no sign-up.
