"""Web page content extraction using trafilatura."""
import asyncio
from dataclasses import dataclass, field

import trafilatura
import trafilatura.settings


@dataclass
class PageData:
    url: str
    title: str = ""
    description: str = ""
    site_name: str = ""
    author: str = ""
    thumbnail: str = ""
    content: str = ""


def _extract_sync(url: str) -> PageData:
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError(f"Could not fetch content from {url!r}")

    content = trafilatura.extract(
        downloaded,
        include_comments=False,
        include_tables=True,
        favor_recall=True,
        no_fallback=False,
    )

    meta = trafilatura.extract_metadata(downloaded)

    def _s(v) -> str:
        return str(v).strip() if v else ""

    return PageData(
        url=url,
        title=_s(meta.title) if meta else "",
        description=_s(meta.description) if meta else "",
        site_name=_s(meta.sitename) if meta else "",
        author=_s(meta.author) if meta else "",
        thumbnail=_s(meta.image) if meta else "",
        content=content or "",
    )


async def extract_page(url: str) -> PageData:
    return await asyncio.to_thread(_extract_sync, url)
