"""Static readiness checks. No outside requests, registrations or payments."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

root = Path(__file__).resolve().parent.parent
class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs, self.ids, self.tags = [], set(), []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if "id" in attrs:
            assert attrs["id"] not in self.ids, f"Duplicate ID: {attrs['id']}"
            self.ids.add(attrs["id"])
        for key in ["href", "src"]:
            if attrs.get(key):
                self.refs.append(attrs[key])

pages = {}
for file in root.rglob("*.html"):
    if any(part.startswith(".") for part in file.relative_to(root).parts):
        continue
    page = Page()
    page.feed(file.read_text())
    pages[file] = page
    assert any(tag == "html" and attrs.get("lang") == "en" for tag, attrs in page.tags), file
    assert any(tag == "main" or attrs.get("id") == "app" for tag, attrs in page.tags), file
    assert any(tag == "meta" and attrs.get("name") == "viewport" for tag, attrs in page.tags), file
    for tag, attrs in page.tags:
        if tag == "img":
            assert attrs.get("alt"), f"Missing image alternative: {file}"
for file, page in pages.items():
    for ref in page.refs:
        url = urlsplit(ref)
        if url.scheme or url.netloc:
            continue
        target = root / url.path.lstrip("/") if url.path.startswith("/") else file.parent / url.path
        if not url.path:
            target = file
        if target.is_dir():
            target /= "index.html"
        target = target.resolve()
        assert target.exists(), f"{file.relative_to(root)} → missing {ref}"
        if url.fragment and target in pages:
            assert unquote(url.fragment) in pages[target].ids, f"{file.relative_to(root)} → missing fragment {ref}"

home = pages[root / "index.html"]
form = next(attrs for tag, attrs in home.tags if tag == "form")
assert form["data-netlify"] == "true" and form["method"] == "POST" and form["name"] == "contact"
assert form["action"] == "/contact/received/"
assert any(tag == "input" and attrs.get("name") == "form-name" and attrs.get("value") == "contact" for tag, attrs in home.tags)
assert (root / form["action"].strip("/") / "index.html").exists()
product = (root / "job-profit-workbook/index.html").read_text()
assert "$199 one-time" in product and "7-day free trial" in product
assert product.count('href="JobProfitWorkbookSetup.exe"') == 3
assert 'href="/job-profit-workbook/app/' not in product
for route in ["success", "cancel"]:
    file = root / f"job-profit-workbook/purchase/{route}/index.html"
    source = file.read_text()
    assert "noindex, follow" in source
    assert all(f"/#{old}" not in source for old in ["services", "about", "experience"])
    assert "Check purchase status" in source and "mailto:contact@zimbulapps.com" in source
print(f"PASS: {len(pages)} HTML pages — navigation/assets, fragments, landmarks, image alternatives, offer and Netlify form contract.")
