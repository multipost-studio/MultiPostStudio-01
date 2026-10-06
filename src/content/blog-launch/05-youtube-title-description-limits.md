---
title: YouTube Title and Description Limits (Characters, Bytes, Hashtags)
slug: youtube-title-description-limits
excerpt: YouTube titles stop at 100 characters, descriptions at 5,000 bytes, and more than 60 hashtags voids them all. Learn how each limit is measured.
seoTitle: YouTube Description Character Limit and Title Length
seoDescription: The YouTube description character limit is really 5,000 bytes, and titles allow 100 characters. Learn how hashtags and tags fit within the rules.
focusKeyword: youtube description character limit
secondaryKeywords: youtube title length, youtube hashtags limit, youtube tags vs hashtags
category: Platform Guides
tags: youtube, video descriptions, hashtags
readMins: 7
---

The YouTube description character limit is actually a byte limit: 5,000 bytes in the YouTube Data API, as of 2026. Titles are capped at 100 characters. Because plain English letters use 1 byte each but accented letters, Hindi and emoji use 2 to 4, a description in some languages holds far fewer than 5,000 characters.

## Key takeaways

- The YouTube description character limit is 5,000 bytes in the YouTube Data API, and video titles can be up to 100 characters.
- A byte is not a character, so descriptions written in Hindi, Arabic, Chinese or with many emoji reach the limit with far fewer visible characters than English text.
- If a video carries more than 60 hashtags, YouTube ignores every hashtag on that video, not just the extras.
- Hashtags (written with #) are different from tags, the hidden keywords you can add in YouTube Studio.
- YouTube Shorts can be up to 3 minutes long, and the same title and description limits apply to Shorts uploads.

## What are the YouTube title length and description character limit?

YouTube allows a video title of up to 100 characters and a description of up to 5,000 bytes, according to the YouTube Data API's videos resource. The title limit is a character count. The description limit is measured in bytes, which is a different unit that behaves differently for non-English text.

For the title, 100 is a hard ceiling, but it is not the length to aim for. A title that is clear within a short line is easier to read in search results, on mobile and in suggested video lists. Treat the limit as an upper bound you rarely need.

Under the YouTube description character limit, 5,000 bytes is a lot of room. Most descriptions need a fraction of it: a summary, links, chapter timestamps and a few credits. The challenge is not usually the limit, but the unit.

## Why does YouTube measure descriptions in bytes?

The description limit is in bytes because that is how the YouTube Data API defines it. A byte is a unit of storage. In UTF-8, the encoding used for most web text, characters take different numbers of bytes depending on the script.

This is the pattern for common text:

| Text | Bytes per character (UTF-8) |
|---|---|
| Basic English letters, digits, spaces | 1 |
| Accented Latin letters (for example, é, ñ) | 2 |
| Devanagari (Hindi), most Chinese, Japanese and Korean characters | 3 |
| Most emoji | 4 |

The effect is easiest to see with an example. If every character in a description took 3 bytes, 5,000 bytes would hold roughly 1,666 characters. That is an illustration of the arithmetic, not a measured result, because real descriptions mix scripts, spaces and punctuation. A Hindi description with English links and timestamps will land somewhere between the two.

Readers who publish in Hindi or other Indian languages, or who add many emoji, should count bytes and not characters. A description that looks short may already be close to the limit.

### How do you count bytes before you publish?

Use a counter that measures UTF-8 bytes, or a publishing tool that does it for you. Counting visible characters in a word processor will not catch the problem. If you copy a long description between tools, check it again after pasting, because some editors change quotation marks and dashes into multi-byte characters.

## How do YouTube hashtags work, and what is the 60-hashtag rule?

YouTube hashtags are words starting with # that you add to a title or a description. YouTube's Help Center says that if a video has more than 60 hashtags, YouTube ignores all hashtags on that video. That is the entire penalty described: the extras are not trimmed, the whole set stops working.

Here are practical consequences:

1. **Stay far below 60.** There is no benefit in approaching the line. A handful of relevant hashtags is a more sensible target than a long list.
2. **Do not paste in a block of tags from another platform.** Lists written for Instagram or TikTok were not designed for YouTube.
3. **Keep hashtags relevant to the video.** A hashtag should describe what the video is about, so a viewer who clicks it gets more of the same.

The rule is about hashtags in the visible text. It is separate from the hidden tags, which we cover next.

## What is the difference between YouTube tags and hashtags?

Hashtags are visible and tags are hidden. A hashtag appears in your title or description, begins with # and is clickable. A tag is a keyword you enter in the video's details in YouTube Studio. Viewers do not see tags on the watch page.

The 60 figure refers to hashtags only. Do not confuse it with limits on the tag field. The Help Center page on hashtags and the Data API documentation describe separate things, so check the right one for what you are doing.

A simple division of work:

- **Title and description:** write these for people. Say what the video offers in plain words, and include the terms viewers would use to look for it.
- **Hashtags:** use a few that group your video with similar ones.
- **Tags:** treat them as a small, supporting detail, for example to include common misspellings of a name.

YouTube has not published a formula for how any of these influence ranking, so we do not claim one. Being accurate and consistent is the dependable approach.

## How do Shorts differ?

YouTube Shorts follow the same title and description limits as regular videos, and a Short can be up to 3 minutes long as of 2026. If you publish a Short through a tool, the same 100-character title and 5,000-byte description rules apply.

A short title also reads better on a small vertical screen. Write a title that reads well on one line, and keep the key words at the start. Put links and detail in the description, where the room is.

## What is a sensible way to write each field?

A repeatable structure makes the limits easy to live with. This one works for most videos:

1. **Title (under 100 characters):** the topic first, then the benefit or angle. Cut filler words.
2. **Opening lines of the description:** a summary that works on its own, since viewers see the start of the text before they expand it.
3. **Body:** links, chapter timestamps and credits, in short lines.
4. **Hashtags:** two or three at the end, far under 60.
5. **Final check:** count the description in bytes if it contains non-English text or emoji.

Write the description once, then check it. If it is close to 5,000 bytes, trim the least useful links before you cut the summary.

## Frequently asked questions

### What is the YouTube description character limit?

The limit is 5,000 bytes in the YouTube Data API, not 5,000 characters. English text uses about 1 byte per character, but accented letters, Hindi, Chinese and emoji use 2 to 4 bytes each.

### How long can a YouTube title be?

A YouTube video title can be up to 100 characters. Shorter titles are easier to read in search results and on small screens.

### How many hashtags can you use on YouTube?

If a video has more than 60 hashtags, YouTube ignores all of them. Staying well below that, with a few relevant hashtags, is the safe approach.

### Are YouTube tags and hashtags the same thing?

No. Hashtags start with # and appear in your title or description. Tags are hidden keywords entered in YouTube Studio, and viewers do not see them on the watch page.

## How MultiPost Studio helps

MultiPost Studio checks YouTube titles against the 100-character limit and descriptions against the 5,000-byte limit, and it warns you when a video has more than 60 hashtags. Seeing a byte count rather than a character count helps when you write in languages or with emoji that use more bytes per character. See [the platform-aware checks in the composer](/features).
