class PhotoDeckV2phSource extends ComicSource {
    name = "V2PH"

    key = "photo_deck_v2ph"

    version = "0.3.29"

    minAppVersion = "1.17.0"

    siteUrl = "https://www.v2ph.com/"
    url = "https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/scripts/v2ph.js"

    hosts = [
        "www.v2ph.com",
        "www.v2ph.net",
        "www.v2ph.ru",
        "www.v2ph.ovh",
        "cdn.v2ph.com"
    ]

    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7,ja;q=0.6",
        "Referer": "https://www.v2ph.com/"
    }

    imageAccept = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"

    detailCache = {}

    // Full reader images are kept separately from ComicDetails.thumbnails.
    // Venera renders thumbnails before recommendations in a fixed UI order;
    // keeping this field separate lets the source hide the long Preview block
    // without affecting loadEp or reader image completeness.
    readerImageCache = {}

    albumUrlStyle = {}

    rawBodyCache = {}

    lastRawBody = ""

    lastSourceUrl = ""

    tagLinkMap = {}

    webLoginVisitedLoginPage = false

    webLoginStartedAt = 0

    account = {
        loginWithWebview: {
            url: "https://www.v2ph.com/login",
            checkStatus: (url, title) => {
                const currentUrl = String(url ?? "")
                const currentTitle = String(title ?? "").toLowerCase()
                if (!/^https:\/\/([^/]+\.)?v2ph\.(com|net|ru|ovh)\//i.test(currentUrl)) return false
                if (!currentTitle) return false
                if (currentTitle.includes("just a moment")) return false
                if (currentTitle.includes("attention required")) return false
                if (currentTitle.includes("403")) return false
                if (currentTitle.includes("forbidden")) return false
                if (currentTitle.includes("cloudflare")) return false

                const path = currentUrl
                    .replace(/^https?:\/\/[^/]+/i, "")
                    .split("#")[0]
                    .split("?")[0]
                    .replace(/\/+$/, "") || "/"

                const onLoginPage = /^\/login\/?$/i.test(path) || currentTitle === "login - v2ph" || /^login\b/i.test(currentTitle)
                const onAccountEntryPage = /^\/(login|signup|register|password|forgot|reset)/i.test(path) ||
                    currentTitle.includes("sign up") ||
                    currentTitle.includes("forgot password") ||
                    currentTitle.includes("reset password")

                if (onLoginPage) {
                    this.webLoginVisitedLoginPage = true
                    if (!this.webLoginStartedAt) this.webLoginStartedAt = Date.now()
                    return false
                }

                if (!this.webLoginVisitedLoginPage) return false
                if (onAccountEntryPage) return false

                // Do not close the WebView immediately after the login page starts loading.
                // V2PH may change title/url several times during Cloudflare verification and login redirects.
                const elapsed = this.webLoginStartedAt ? Date.now() - this.webLoginStartedAt : 0
                if (elapsed < 8000) return false

                return true
            },
            onLoginSuccess: async () => {
                this.webLoginVisitedLoginPage = false
                this.webLoginStartedAt = 0
                UI.showMessage("V2PH WebView login/verification saved by Venera. Retry the source.")
            },
        },
        logout: () => {
            this.webLoginVisitedLoginPage = false
            this.webLoginStartedAt = 0
            this.deleteCookiesFromKnownHosts()
            UI.showMessage("V2PH session cleared.")
        },
        registerWebsite: "https://www.v2ph.com/signup"
    }

    settings = {
        sessionHint: {
            title: "Cloudflare / login note",
            type: "callback",
            buttonText: "Show note",
            callback: () => {
                UI.showMessage("Open source account settings, use Login with webview, finish Cloudflare and V2PH login, then retry. This config does not bypass Cloudflare automatically.")
            }
        }
    }

    cleanText(text) {
        return (text ?? "").replace(/\s+/g, " ").trim()
    }

    absoluteUrl(raw, base = this.siteUrl) {
        const value = String(raw ?? "").trim()
        if (!value || value === "#") return ""
        if (value.startsWith("//")) return "https:" + value
        if (value.startsWith("http://") || value.startsWith("https://")) return value
        const root = String(base || this.siteUrl).replace(/\/$/, "")
        if (value.startsWith("/")) return root + value
        return root + "/" + value
    }

    localizedPath(path) {
        const value = String(path ?? "").trim()
        if (!value) return value
        if (/[?&]hl=/i.test(value)) return value
        if (/\.(?:jpe?g|png|webp|avif|gif|svg)(?:[?#].*)?$/i.test(value)) return value
        if (/^https?:\/\//i.test(value) && !/^https?:\/\/([^/]+\.)?v2ph\.(?:com|net|ru|ovh)\//i.test(value)) return value
        const hashIndex = value.indexOf("#")
        const base = hashIndex >= 0 ? value.slice(0, hashIndex) : value
        const hash = hashIndex >= 0 ? value.slice(hashIndex) : ""
        return `${base}${base.includes("?") ? "&" : "?"}hl=zh-Hans${hash}`
    }

    withoutHashAndQuery(url) {
        return String(url ?? "").split("#")[0].split("?")[0]
    }

    pathFromUrl(url) {
        return this.withoutHashAndQuery(this.absoluteUrl(url)).replace(/^https?:\/\/[^/]+/i, "") || "/"
    }

    pathWithQueryFromUrl(url) {
        const full = String(this.absoluteUrl(url) || url || "").split("#")[0]
        const path = full.replace(/^https?:\/\/[^/]+/i, "")
        return path || "/"
    }

    normalizeAlbumId(value) {
        const raw = String(value ?? "").trim()
        const withoutQuery = raw.split("#")[0].split("?")[0].replace(/\/+$/g, "")
        const match = /\/album\/([^/?#]+?)(?:\/\d+)?(?:\.html)?$/i.exec(withoutQuery)
        if (match) return match[1]
        return withoutQuery
            .replace(/^https?:\/\/[^/]+/i, "")
            .replace(/^\/?album\//i, "")
            .replace(/(?:\/\d+)?(?:\.html)?$/i, "")
    }

    extractAlbumId(href) {
        const path = this.pathFromUrl(href).replace(/\/+$/g, "")
        const match = /^\/album\/([^/?#]+?)(?:\/\d+)?(?:\.html)?$/i.exec(path)
        return match?.[1] ?? ""
    }

    isCodeLikeBareAlbumId(id) {
        const albumId = String(id ?? "")
        return /^[A-Z]+[-_]?\d+/i.test(albumId) && /[A-Z]/.test(albumId)
    }

    albumStyleFromHref(href, id = "") {
        const path = this.pathFromUrl(href).replace(/\/+$/g, "")
        if (/^\/album\/[^/?#]+\.html$/i.test(path)) return "html"
        if (/^\/album\/[^/?#.]+$/i.test(path) && this.isCodeLikeBareAlbumId(id || this.extractAlbumId(href))) return "bare"
        return ""
    }

    detailPath(id, page = 1, style = "html") {
        const albumId = this.normalizeAlbumId(id)
        const currentPage = this.normalizePage(page, 1)

        // V2PH has used more than one album paging shape in real pages/cache:
        //   /album/<id>.html?page=N
        //   /album/<id>?page=N
        //   /album/<id>/<N>.html
        // Keep page fetching tolerant, but only for detail pages.
        if (style === "bare") {
            return currentPage > 1 ? `/album/${albumId}?page=${currentPage}` : `/album/${albumId}`
        }
        if (style === "slash") {
            return currentPage > 1 ? `/album/${albumId}/${currentPage}.html` : `/album/${albumId}.html`
        }
        return currentPage > 1 ? `/album/${albumId}.html?page=${currentPage}` : `/album/${albumId}.html`
    }

    detailPathCandidates(id, page = 1, preferredStyle = "") {
        const albumId = this.normalizeAlbumId(id)
        const currentPage = this.normalizePage(page, 1)
        // Recent V2PH short-code albums such as YTY-10431 return 404 for
        // /album/<id>.html but work as /album/<id>.  Prefer the already known
        // style; when unknown, avoid the noisy html-first 404 for code-like IDs.
        const defaultStyle = this.isCodeLikeBareAlbumId(albumId) ? "bare" : "html"
        const first = preferredStyle || this.albumUrlStyle[albumId] || defaultStyle
        const styles = []
        const addStyle = (style) => {
            if (style && !styles.includes(style)) styles.push(style)
        }
        addStyle(first)
        addStyle("html")
        addStyle("bare")
        if (currentPage > 1) addStyle("slash")
        const result = []
        for (const style of styles) {
            const path = this.detailPath(albumId, currentPage, style)
            if (!result.some((item) => item.path === path)) result.push({ path, style })
        }
        return result
    }

    splitSrcset(value) {
        return String(value ?? "")
            .split(",")
            .map((part) => part.trim().split(/\s+/)[0])
            .filter((part) => part.length > 0)
    }

    classList(element) {
        return Array.from(element?.classNames ?? element?.classes ?? [])
    }

    cssImageUrls(style) {
        const result = []
        const source = String(style ?? "")
        const pattern = /url\((['"]?)(.*?)\1\)/ig
        let match = null
        while ((match = pattern.exec(source)) !== null) {
            const value = match[2]
            if (value && value !== "none") result.push(value)
        }
        return result
    }

    normalizeEscapedUrl(value) {
        let text = String(value ?? "").trim()
        if (!text) return ""

        // Avoid regex literals such as /\\//g here. Venera's embedded JS runtime
        // can parse that form as a division expression and throw "g is not defined".
        // Use split/join so list covers and detail images do not crash in imageUrl().
        text = text.split("&amp;").join("&")
        text = text.split("\\u002F").join("/")
        text = text.split("\u002F").join("/")
        text = text.split("\\/").join("/")
        text = text.split("\\").join("/")
        return text
    }
    imageUrl(raw) {
        const value = this.normalizeEscapedUrl(raw)
        if (!value || value === "#" || value.startsWith("data:image/")) return ""

        let url = this.absoluteUrl(value)

        // V2PH detail-photo paths are served by the CDN.  The raw HTML fallback
        // can expose them as relative `/photos/...`; resolving those against
        // `www.v2ph.com` creates dead URLs such as
        // `https://www.v2ph.com/photos/xxx.jpg` which return 404 in the reader.
        // Normalize all `/photos/` image keys to the CDN before they enter
        // thumbnails/loadEp/onImageLoad.
        if (/^\/photos\//i.test(value)) {
            url = `https://cdn.v2ph.com${value}`
        } else {
            url = url.replace(/^https?:\/\/(?:www\.)?v2ph\.(?:com|net|ru|ovh)(\/photos\/)/i, "https://cdn.v2ph.com$1")
        }

        const lower = url.toLowerCase()
        if (lower.includes("placeholder") || lower.includes("loading") || lower.includes("/logo") || lower.includes("favicon")) return ""

        // V2PH list covers are sometimes served through CDN/file endpoints without a
        // conventional image suffix. Accept those endpoints in addition to normal
        // jpg/png/webp/avif URLs so list/search covers do not become empty strings.
        const looksLikeImage =
            /\.(jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(url) ||
            /\/photos\//i.test(url) ||
            /\/file\//i.test(url) ||
            /\/uploads?\//i.test(url) ||
            /^https?:\/\/cdn\.v2ph\.(?:com|net|ru|ovh)\//i.test(url)
        return looksLikeImage ? url : ""
    }

    firstImageUrl(root) {
        const nodes = root?.querySelectorAll([
            "img[src]",
            "img[data-src]",
            "img[data-original]",
            "img[data-original-src]",
            "img[data-lazy-src]",
            "img[srcset]",
            "img[data-srcset]",
            "img[data-lazy-srcset]",
            "source[srcset]",
            "source[data-srcset]",
            "video[poster]",
            "[data-bg]",
            "[data-background]",
            "[data-cover]",
            "[data-thumb]",
            "[data-thumbnail]",
            "[style*='url(']"
        ].join(", ")) ?? []
        for (const node of nodes) {
            const candidates = [
                node.attributes?.["data-original"],
                node.attributes?.["data-original-src"],
                node.attributes?.["data-lazy-src"],
                node.attributes?.["data-src"],
                node.attributes?.["data-cover"],
                node.attributes?.["data-thumb"],
                node.attributes?.["data-thumbnail"],
                node.attributes?.["data-bg"],
                node.attributes?.["data-background"],
                node.attributes?.poster,
                node.attributes?.src,
                ...this.splitSrcset(node.attributes?.srcset),
                ...this.splitSrcset(node.attributes?.["data-srcset"]),
                ...this.splitSrcset(node.attributes?.["data-lazy-srcset"]),
                ...this.cssImageUrls(node.attributes?.style)
            ]
            for (const candidate of candidates) {
                const url = this.imageUrl(candidate)
                if (url) return url
            }
        }
        return ""
    }

    tagNamespace(namespace) {
        const value = this.cleanText(namespace).toLowerCase()
        if (value === "model" || value === "models" || value === "模特") return "Model"
        if (value === "tag" || value === "tags" || value === "标签" || value === "標籤") return "Tags"
        if (value === "vendor" || value === "vendors" || value === "厂商" || value === "廠商") return "Vendor"
        return this.cleanText(namespace)
    }

    tagLinkKey(namespace, tag) {
        return `${this.tagNamespace(namespace)}\n${this.cleanText(tag)}`
    }

    rememberTagLink(namespace, name, href) {
        const display = this.cleanText(name)
        const path = this.pathWithQueryFromUrl(href)
        if (!display || !path || path === "/") return
        this.tagLinkMap[this.tagLinkKey(namespace, display)] = path
    }

    storedTagLink(namespace, tag) {
        return this.tagLinkMap[this.tagLinkKey(namespace, tag)] || ""
    }

    displayNameFromLink(link) {
        const candidates = [
            link?.text,
            link?.attributes?.title,
            link?.attributes?.["aria-label"],
            link?.attributes?.["data-title"],
            link?.attributes?.alt
        ]
        for (const candidate of candidates) {
            const value = this.cleanText(candidate)
            if (value) return value
        }
        return ""
    }

    preferVisibleInfoValue(kind, node, fallback) {
        const text = this.cleanText(node?.text)
        if (!text) return this.cleanText(fallback)
        const labelPattern = /^(?:照片|圖片|图片|写真|photos?|pics?|pictures?|頁數|页数|張數|张数|模特|麻豆|モデル|models?|標籤|标签|tags?|廠商|厂商|來源|来源|機構|机构|寫真機構|写真机构|vendors?|source|companies?|company|套圖|套图|系列)\s*[:：]?\s*/i
        const withoutLabel = text.replace(labelPattern, "")
        const parts = this.splitInfoValues(withoutLabel)
        if (kind === "model") {
            for (const part of parts) {
                // Prefer the visible CJK/Japanese name from the page over romanized link text.
                if (/[\u3040-\u30ff\u3400-\u9fff]/.test(part) && !this.extractImageCount(part)) return part
            }
        }
        return this.cleanText(fallback) || parts[0] || ""
    }

    entityEntriesByPath(root, patterns, namespace = "") {
        const result = []
        const seen = {}
        for (const link of root?.querySelectorAll("a[href]") ?? []) {
            const hrefRaw = String(link.attributes?.href ?? "")
            const href = hrefRaw.toLowerCase()
            let matched = false
            for (const pattern of patterns) {
                if (href.includes(pattern)) {
                    matched = true
                    break
                }
            }
            if (!matched) continue
            const value = this.displayNameFromLink(link)
            const path = this.pathWithQueryFromUrl(hrefRaw)
            if (value && !seen[value]) {
                seen[value] = true
                result.push({ name: value, path })
                if (namespace) this.rememberTagLink(namespace, value, path)
            }
        }
        return result
    }

    linkValuesByPath(root, patterns, namespace = "") {
        return this.entityEntriesByPath(root, patterns, namespace).map((item) => item.name)
    }

    extractImageCount(text) {
        const value = this.cleanText(text)
        const patterns = [
            /Photos?\s*[:：]?\s*P?\s*(\d+)/i,
            /(?:照片|圖片|图片|写真|圖|图)\s*[:：]?\s*(\d+)\s*(?:張|张|P)?/i,
            /\bP\s*(\d+)\b/i,
            /\b(\d+)\s*P\b/i,
            /(\d+)\s*(?:張|张)\b/i
        ]
        for (const pattern of patterns) {
            const match = pattern.exec(value)
            if (match) {
                const count = Number(match[1])
                if (count > 0 && count < 10000) return count
            }
        }
        return null
    }

    extractLastImageCount(text) {
        const value = this.cleanText(text)
        const patterns = [
            /Photos?\s*[:：]?\s*P?\s*(\d+)/ig,
            /(?:照片|圖片|图片|写真|圖|图)\s*[:：]?\s*(\d+)\s*(?:張|张|P)?/ig,
            /\bP\s*(\d+)\b/ig,
            /\b(\d+)\s*P\b/ig,
            /(\d+)\s*(?:張|张)\b/ig
        ]
        let last = null
        for (const pattern of patterns) {
            let match = null
            while ((match = pattern.exec(value)) !== null) {
                const count = Number(match[1])
                if (count > 0 && count < 10000) last = count
            }
        }
        return last
    }

    imageCountNearTitle(doc, title) {
        const needle = this.cleanText(title)
        if (!needle) return null
        const bodyText = this.cleanText(doc?.body?.text ?? "")
        if (!bodyText) return null
        const index = bodyText.indexOf(needle)
        if (index <= 0) return null
        const before = bodyText.slice(Math.max(0, index - 80), index)
        return this.extractLastImageCount(before)
    }

    cardImageCount(card, link, doc, title) {
        return this.extractImageCount(card?.text ?? "") ||
            this.extractImageCount(link?.parent?.text ?? "") ||
            this.extractImageCount(link?.text ?? "") ||
            this.imageCountNearTitle(doc, title)
    }

    uniqueValues(values) {
        const result = []
        const seen = {}
        for (const value of values ?? []) {
            const text = this.cleanText(value)
            if (!text) continue
            if (!seen[text]) {
                seen[text] = true
                result.push(text)
            }
        }
        return result
    }

    splitInfoValues(text) {
        return this.cleanText(text)
            .split(/[、,，\/|;；]+|\s{2,}/)
            .map((item) => this.cleanText(item))
            .filter((item) => item && !/^(?:-|—|N\/?A|null|undefined)$/i.test(item))
    }

    labelKind(text) {
        const value = this.cleanText(text).toLowerCase().replace(/[:：]/g, "")
        if (!value) return ""
        if (/(?:照片|圖片|图片|写真|photos?|pics?|pictures?|頁數|页数|張數|张数)/i.test(value)) return "count"
        if (/(?:模特|麻豆|モデル|model|models)/i.test(value)) return "model"
        if (/(?:標籤|标签|tag|tags)/i.test(value)) return "tag"
        if (/(?:廠商|厂商|來源|来源|機構|机构|寫真機構|写真机构|vendor|vendors?|company|companies|source|套圖|套图|系列)/i.test(value)) return "vendor"
        return ""
    }

    addInfoValues(target, kind, node) {
        if (!kind || !node) return
        if (kind === "count") {
            const count = this.extractImageCount(node.text)
            if (count) target.imageCount = target.imageCount || count
            return
        }

        let values = []
        let entries = []
        if (kind === "model") entries = this.entityEntriesByPath(node, ["/actor/", "actor/", "/model", "model/"], "Model")
        if (kind === "tag") entries = this.entityEntriesByPath(node, ["/category/", "category/", "/tag", "tag/"], "Tags")
        if (kind === "vendor") entries = this.entityEntriesByPath(node, ["/company/", "company/", "/vendor", "vendor/"], "Vendor")
        if (entries.length) {
            for (const entry of entries) {
                const display = this.preferVisibleInfoValue(kind, node, entry.name)
                if (!display) continue
                values.push(display)
                this.rememberTagLink(kind === "model" ? "Model" : (kind === "tag" ? "Tags" : "Vendor"), display, entry.path)
            }
        }
        if (!values.length) values = this.splitInfoValues(node.text)
        if (kind === "model") target.models = this.uniqueValues([...target.models, ...values])
        if (kind === "tag") target.tags = this.uniqueValues([...target.tags, ...values])
        if (kind === "vendor") target.vendors = this.uniqueValues([...target.vendors, ...values])
    }

    extractDetailMetadata(doc) {
        const result = { imageCount: null, models: [], tags: [], vendors: [] }
        const infoRoots = [
            doc.querySelector(".album-info"),
            doc.querySelector(".album-detail"),
            doc.querySelector(".album-meta"),
            doc.querySelector(".detail"),
            doc.querySelector(".card"),
            doc.querySelector("dl")
        ].filter((root, index, list) => root && list.indexOf(root) === index)
        const roots = infoRoots.length ? infoRoots : [doc.querySelector("main")].filter((root) => root)

        for (const root of roots) {
            for (const link of root.querySelectorAll("a[href]")) {
                const href = String(link.attributes?.href ?? "").toLowerCase()
                const text = this.cleanText(link.text)
                if (!text) continue
                if (href.includes("/actor/") || href.includes("actor/") || href.includes("/model") || href.includes("model/")) {
                    result.models = this.uniqueValues([...result.models, text])
                    this.rememberTagLink("Model", text, link.attributes?.href)
                }
                if (href.includes("/category/") || href.includes("category/") || href.includes("/tag") || href.includes("tag/")) {
                    result.tags = this.uniqueValues([...result.tags, text])
                    this.rememberTagLink("Tags", text, link.attributes?.href)
                }
                if (href.includes("/company/") || href.includes("company/") || href.includes("/vendor") || href.includes("vendor/")) {
                    result.vendors = this.uniqueValues([...result.vendors, text])
                    this.rememberTagLink("Vendor", text, link.attributes?.href)
                }
            }

            for (const label of root.querySelectorAll("dt, th, .label, .key, .name")) {
                const kind = this.labelKind(label.text)
                if (!kind) continue
                const valueNode = label.nextElementSibling
                this.addInfoValues(result, kind, valueNode)
            }

            for (const row of root.querySelectorAll("tr, .row")) {
                const cells = row.children ?? []
                if (!cells || cells.length < 2) continue
                const kind = this.labelKind(cells[0].text)
                if (!kind) continue
                this.addInfoValues(result, kind, cells[1])
            }
        }

        // Conservative text fallback for count only. Prefer dedicated info blocks;
        // scanning the whole main/body can pick up Related Galleries counts.
        for (const root of roots) {
            const count = this.extractImageCount(root.text)
            if (count && (!result.imageCount || count > result.imageCount)) result.imageCount = count
        }

        result.models = this.uniqueValues(result.models)
        result.tags = this.uniqueValues(result.tags)
        result.vendors = this.uniqueValues(result.vendors)
        return result
    }

    pageFromHref(href) {
        const value = String(href ?? "").split("&amp;").join("&")
        const queryPage = Number(/[?&](?:page|p|paged)=(\d+)/i.exec(value)?.[1] ?? "0")
        const pathPage = Number(/\/page\/(\d+)\/?/i.exec(value)?.[1] ?? "0")
        const slashPage = Number(/\/(\d+)\/?(?:[?#].*)?$/i.exec(value)?.[1] ?? "0")
        return Math.max(queryPage, pathPage, slashPage)
    }

    listPageFromHref(href) {
        const value = String(href ?? "").split("&amp;").join("&")
        const queryPage = Number(/[?&](?:page|p|paged)=(\d+)/i.exec(value)?.[1] ?? "0")
        const pathPage = Number(/\/page\/(\d+)\/?/i.exec(value)?.[1] ?? "0")
        // For list pages, do not treat a trailing /123 as a page number.
        // V2PH list pagination uses query page=N, while album/detail URLs can
        // contain numeric path tails.
        return Math.max(queryPage, pathPage)
    }

    rawBodyOf(doc) {
        const direct = String(doc?._rawBody ?? "")
        if (direct) return direct
        const source = String(doc?._sourceUrl ?? "")
        if (source && this.rawBodyCache[source]) return String(this.rawBodyCache[source] ?? "")
        return String(this.lastRawBody ?? "")
    }

    stripTags(text) {
        return String(text ?? "").replace(/<[^>]+>/g, " ")
    }

    decodeHtmlText(text) {
        return String(text ?? "")
            .split("&amp;").join("&")
            .split("&quot;").join('"')
            .split("&#039;").join("'")
            .split("&apos;").join("'")
            .split("&lt;").join("<")
            .split("&gt;").join(">")
    }

    numberFromText(value) {
        const text = String(value ?? "").replace(/,/g, "")
        const match = /(\d+)/.exec(text)
        const number = Number(match?.[1] ?? "0")
        return Number.isFinite(number) ? number : 0
    }

    currentListPath(doc) {
        const source = String(doc?._sourceUrl ?? this.lastSourceUrl ?? "")
        const path = this.pathWithQueryFromUrl(source)
        return path || "/"
    }

    isSameListFamily(href, doc) {
        const hrefPath = this.pathWithQueryFromUrl(href)
        if (!hrefPath) return false
        const hrefBase = hrefPath.split("?")[0].replace(/\/+$/g, "") || "/"
        const currentBase = this.currentListPath(doc).split("?")[0].replace(/\/+$/g, "") || "/"
        if (hrefBase === currentBase) return true
        // V2PH sometimes emits language links without/with the language query, but
        // category/tag/country/company/search list paths keep the same base path.
        return hrefBase.toLowerCase() === currentBase.toLowerCase()
    }

    extractTotalListCountFromText(text) {
        const source = this.cleanText(this.decodeHtmlText(text))
        const patterns = [
            /已收录\s*([\d,]+)\s*套/i,
            /已收錄\s*([\d,]+)\s*套/i,
            /收录(?:的|了)?\s*([\d,]+)\s*套/i,
            /收錄(?:的|了)?\s*([\d,]+)\s*套/i,
            /(?:total|records?|albums?|sets?)\s*[:：]?\s*([\d,]+)/i,
            /([\d,]+)\s*(?:套写真集|套寫真集|albums?|sets?)/i
        ]
        for (const pattern of patterns) {
            const match = pattern.exec(source)
            if (!match) continue
            const count = this.numberFromText(match[1])
            if (count > 0 && count < 1000000) return count
        }
        return null
    }

    extractMaxPageFromRaw(doc, currentPage = 1) {
        const raw = this.rawBodyOf(doc)
        if (!raw) return null
        const values = []
        const add = (value) => {
            const page = Number(value ?? 0)
            if (Number.isFinite(page) && page > 0 && page < 1000000) values.push(page)
        }
        const anchorPattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/ig
        let match = null
        while ((match = anchorPattern.exec(raw)) !== null) {
            const href = this.decodeHtmlText(match[2])
            const text = this.cleanText(this.decodeHtmlText(this.stripTags(match[3]))).toLowerCase()
            const page = this.listPageFromHref(href)
            if (page <= 0) continue
            const paginationText = /^\d+$/.test(text) ||
                ["first", "previous", "prev", "next", "last", "首页", "上一页", "下一页", "末页"].includes(text)
            const listPagingHref = /[?&](?:page|p|paged)=\d+/i.test(href) || /\/page\/\d+\/?/i.test(href)
            if ((paginationText || listPagingHref) && this.isSameListFamily(href, doc)) add(page)
        }

        // Raw fallback.  Venera's HtmlDocument can expose fewer attributes than
        // the browser DOM on some pages.  Match only the current list path family
        // so album detail page params do not contaminate category/tag maxPage.
        const currentBase = this.currentListPath(doc).split("?")[0].replace(/\/+$/g, "") || "/"
        const escapedBase = currentBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const explicitPatterns = [
            new RegExp(`${escapedBase}[^"'<>]*[?&](?:page|p|paged)=(\\d+)`, "ig"),
            new RegExp(`${escapedBase}[^"'<>]*/page/(\\d+)`, "ig"),
            /[?&](?:page|p|paged)=(\d+)/ig,
            /\/page\/(\d+)\/?/ig
        ]
        for (const explicitPagePattern of explicitPatterns) {
            while ((match = explicitPagePattern.exec(raw)) !== null) add(match[1])
        }

        const totalCount = this.extractTotalListCountFromText(raw)
        if (totalCount) add(Math.ceil(totalCount / 16))

        const titlePage = /第\s*(\d+)\s*页/i.exec(raw)
        if (titlePage) add(titlePage[1])
        if (/下一页/i.test(raw) || /rel=["']next["']/i.test(raw)) add(this.normalizePage(currentPage, 1) + 1)
        return values.length ? Math.max.apply(null, values) : null
    }

    estimateListPageSize(doc, comicsLength) {
        const count = Number(comicsLength ?? 0)
        if (count >= 12 && count <= 24) return count
        const raw = this.rawBodyOf(doc)
        const albumMatches = raw ? raw.match(/href\s*=\s*["'][^"']*\/album\//ig) : null
        const rawCount = albumMatches ? albumMatches.length : 0
        if (rawCount >= 12 && rawCount <= 24) return rawCount
        // V2PH category/tag/country pages currently render 16 cards per page.
        // This is only a fallback when DOM parsing returns too few cards, and is
        // much better than displaying every tag page as 1/1.
        return 16
    }

    isPaginationNode(link) {
        const rel = String(link.attributes?.rel ?? "").toLowerCase()
        const aria = String(link.attributes?.["aria-label"] ?? "").toLowerCase()
        const text = this.cleanText(link.text).toLowerCase()
        const classes = this.classList(link).join(" ").toLowerCase()
        const parentClasses = this.classList(link.parent).join(" ").toLowerCase()
        return rel.includes("next") || rel.includes("prev") ||
            aria.includes("page") ||
            classes.includes("page") || classes.includes("pagination") ||
            parentClasses.includes("page") || parentClasses.includes("pagination") ||
            ["first", "previous", "prev", "next", "last", "首页", "上一页", "下一页", "末页"].includes(text) ||
            /^\d+$/.test(text)
    }

    extractMaxPage(doc, currentPage = 1) {
        const values = []
        const add = (value) => {
            const page = Number(value ?? 0)
            if (Number.isFinite(page) && page > 0 && page < 1000000) values.push(page)
        }
        for (const link of doc.querySelectorAll("a[href]") ?? []) {
            const href = String(link.attributes?.href ?? "")
            const text = this.cleanText(link.text).toLowerCase()
            const rel = String(link.attributes?.rel ?? "").toLowerCase()
            const ariaPage = Number(/\bpage\s+(\d+)\b/i.exec(String(link.attributes?.["aria-label"] ?? ""))?.[1] ?? "0")
            const hrefPage = this.listPageFromHref(href)

            // Category/search/tag pagination can be displayed with Chinese labels
            // such as 首页 / 上一页 / 下一页 / 末页.  Trust explicit list-page
            // params and numeric pagination text, but avoid album detail numbers.
            if (!this.isPaginationNode(link) && hrefPage <= 0 && ariaPage <= 0) continue

            add(hrefPage)
            add(ariaPage)
            if (/^\d+$/.test(text)) add(text)
            if (rel.includes("next") || text === "next" || text === "下一页") add(this.normalizePage(currentPage, 1) + 1)
        }
        add(this.extractMaxPageFromRaw(doc, currentPage))
        return values.length ? Math.max.apply(null, values) : null
    }

    extractTotalListCount(doc) {
        const bodyCount = this.extractTotalListCountFromText(doc?.body?.text ?? "")
        if (bodyCount) return bodyCount
        const rawCount = this.extractTotalListCountFromText(this.rawBodyOf(doc))
        if (rawCount) return rawCount
        return null
    }

    normalizePage(page, fallback = 1) {
        const value = Number(page ?? fallback)
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
    }

    pageParamPath(path, page) {
        const currentPage = this.normalizePage(page, 1)
        const basePath = String(path || "/")
        if (currentPage <= 1) return basePath
        return `${basePath}${basePath.includes("?") ? "&" : "?"}page=${currentPage}`
    }

    categoryPathMap() {
        return {
            "sexy": "/category/sexy-girls", "性感美女": "/category/sexy-girls",
            "goddess": "/category/nvshen", "女神": "/category/nvshen",
            "short hair": "/category/short-hair", "短发": "/category/short-hair", "短髮": "/category/short-hair",
            "pure": "/category/pure", "清纯": "/category/pure", "清純": "/category/pure",
            "lingerie": "/category/underwear-beauty", "内衣美女": "/category/underwear-beauty", "內衣美女": "/category/underwear-beauty",
            "sexy models": "/category/glamour-models", "glamour models": "/category/glamour-models", "嫩模": "/category/glamour-models",
            "japanese gravure models": "/category/japanese-gravure-models", "日本嫩模": "/category/japanese-gravure-models",
            "cosplay": "/category/cosplay", "角色扮演": "/category/cosplay",
            "big breasts": "/category/big-breasts", "巨乳": "/category/big-breasts",
            "sister duo": "/category/sister-duo", "姐妹花": "/category/sister-duo", "双胞胎": "/category/sister-duo", "雙胞胎": "/category/sister-duo",
            "sukumizu": "/category/sukumizu", "school swimsuit": "/category/sukumizu", "死库水": "/category/sukumizu", "死庫水": "/category/sukumizu", "泳装校服": "/category/sukumizu",
            "loli": "/category/loli", "萝莉": "/category/loli", "蘿莉": "/category/loli",
            "japanese young women": "/category/japanese-young-women", "日本少妇": "/category/japanese-young-women",
            "body art": "/category/the-body-art", "the body art": "/category/the-body-art", "人体艺术": "/category/the-body-art", "人體藝術": "/category/the-body-art",
            "erotic underwear": "/category/erotic-underwear", "情趣内衣": "/category/erotic-underwear", "情趣內衣": "/category/erotic-underwear",
            "av idols": "/category/av-idols", "av-idols": "/category/av-idols", "女优": "/category/av-idols", "女優": "/category/av-idols",
            "nightdress": "/category/nightdress", "睡衣": "/category/nightdress",
            "swimsuit": "/category/swimsuit", "泳装": "/category/swimsuit", "泳裝": "/category/swimsuit",
            "japanese actresses": "/category/japanese-actresses", "日本女星": "/category/japanese-actresses",
            "online girls": "/company/online-girls", "网络美女": "/company/online-girls", "網絡美女": "/company/online-girls",
            "beautiful seaside": "/category/beautiful-seaside", "海边美女": "/category/beautiful-seaside", "海邊美女": "/category/beautiful-seaside",
            "weekly playboy": "/company/weekly-playboy", "花花公子": "/company/weekly-playboy",
            "photo book": "/company/photo-book", "pb写真集": "/company/photo-book", "PB写真集": "/company/photo-book",
            "japanese": "/category/japanese-girls", "日本少女": "/category/japanese-girls",
            "bikini": "/category/bikini-girls", "比基尼": "/category/bikini-girls",
            "china": "/country/china", "中国大陆": "/country/china", "中國大陸": "/country/china",
            "japan": "/country/japan", "日本": "/country/japan",
            "korea": "/country/south-korea", "韩国": "/country/south-korea", "韓國": "/country/south-korea",
            "taiwan": "/country/taiwan", "台湾": "/country/taiwan", "台灣": "/country/taiwan",
            "thailand": "/country/thailand", "泰国": "/country/thailand", "泰國": "/country/thailand",
            "europe and america": "/country/europe", "欧美": "/country/europe", "歐美": "/country/europe"
        }
    }

    categoryPathFor(value) {
        const key = this.cleanText(value).toLowerCase()
        return this.categoryPathMap()[key] ?? ""
    }


    nearestAlbumContainer(element) {
        let current = element
        for (let depth = 0; depth < 8 && current; depth++) {
            const text = this.cleanText(current.text)
            const albumLinks = current.querySelectorAll?.("a[href*='/album/']") ?? []
            const hasAlbum = albumLinks.length > 0
            const hasCount = this.extractImageCount(text) != null
            const hasMetadata = /(机构|機構|厂商|廠商|模特|标签|標籤|Tags?|Model|Vendor)/i.test(text)
            // V2PH list count is usually a card-level sibling text node before the title link.
            // Do not stop at a small link/card node unless it already contains the P count.
            if (hasAlbum && hasCount && (hasMetadata || text.length > this.cleanText(element?.text).length + 3)) return current
            current = current.parent
        }
        return element?.parent ?? element
    }

    requestHeaders(url = this.siteUrl, referer = this.siteUrl) {
        return {
            ...this.headers,
            "Referer": referer || this.siteUrl
        }
    }

    imageHeadersFor(url, referer = this.siteUrl) {
        const headers = {
            "User-Agent": this.headers["User-Agent"],
            "Accept": this.imageAccept,
            "Referer": referer || this.siteUrl
        }
        return headers
    }

    deleteCookiesFromKnownHosts() {
        for (const host of this.hosts) {
            Network.deleteCookies(`https://${host}/`)
        }
    }

    isCloudflareChallenge(response) {
        const headers = response?.headers ?? {}
        const mitigated = String(headers["cf-mitigated"] ?? headers["Cf-Mitigated"] ?? headers["CF-Mitigated"] ?? "").toLowerCase()
        const body = String(response?.body ?? "").toLowerCase()
        return response?.status === 403 && (
            mitigated.includes("challenge") ||
            body.includes("cf-mitigated") ||
            body.includes("just a moment") ||
            body.includes("challenge-platform") ||
            body.includes("window._cf_chl_opt") ||
            body.includes("cf-turnstile") ||
            body.includes("verify you are human") ||
            body.includes("enable javascript and cookies")
        )
    }

    looksLikeLoginRequired(doc) {
        const body = this.cleanText(doc?.body?.text).toLowerCase()
        const loginLinks = doc?.querySelectorAll("a[href*='login'], a[href*='signin'], form[action*='login']") ?? []
        return (loginLinks.length > 0 && (body.includes("login") || body.includes("sign in") || body.includes("log in"))) ||
            body.includes("please login") ||
            body.includes("please log in") ||
            body.includes("login required") ||
            body.includes("sign in to view")
    }

    looksLikePageNotFound(doc) {
        const title = this.cleanText(doc?.querySelector?.("title")?.text).toLowerCase()
        const body = this.cleanText(doc?.body?.text).toLowerCase()
        return title.includes("page not found") ||
            body.includes("page not found") ||
            (body.includes("404") && body.includes("not found"))
    }

    looksLikeQuotaExceeded(doc) {
        const body = this.cleanText(doc?.body?.text).toLowerCase()
        return body.includes("quota") ||
            body.includes("daily limit") ||
            body.includes("view limit") ||
            body.includes("limit exceeded")
    }

    async getDocument(path, referer = this.siteUrl) {
        const target = this.absoluteUrl(this.localizedPath(path))
        const response = await Network.get(target, this.requestHeaders(target, referer))
        if (this.isCloudflareChallenge(response)) {
            throw "V2PH Cloudflare verification required. Open this source account settings and use Login with webview once, then retry."
        }
        if (response.status === 403) {
            throw "V2PH HTTP 403: login or Cloudflare verification required. Use Login with webview first."
        }
        if (response.status >= 400) {
            throw `V2PH HTTP ${response.status}: ${target}`
        }
        const rawBody = String(response.body ?? "")
        this.lastRawBody = rawBody
        this.lastSourceUrl = target
        const doc = new HtmlDocument(rawBody)
        this.rawBodyCache[target] = rawBody
        try {
            doc._rawBody = rawBody
            doc._sourceUrl = target
        } catch (_) {
            // Some native HtmlDocument wrappers may not accept custom fields;
            // rawBodyCache keeps a fallback by source URL.
        }
        if (this.looksLikeQuotaExceeded(doc)) {
            doc.dispose()
            throw "V2PH account quota appears to be exceeded for today."
        }
        return doc
    }

    async getDocumentWithRetry(path, referer = this.siteUrl, retry = 2) {
        let lastError = null
        for (let attempt = 0; attempt <= retry; attempt++) {
            try {
                return await this.getDocument(path, referer)
            } catch (error) {
                const message = String(error ?? "")
                lastError = error
                if (message.includes("HTTP 404") ||
                    message.includes("HTTP 403") ||
                    message.toLowerCase().includes("login") ||
                    message.toLowerCase().includes("quota") ||
                    message.toLowerCase().includes("vip")) {
                    throw error
                }
                if (attempt < retry) await this.sleep(900 * (attempt + 1))
            }
        }
        throw lastError
    }

    parseAlbumList(doc) {
        const drafts = {}
        for (const link of doc.querySelectorAll("a[href*='/album/']")) {
            const href = link.attributes?.href ?? ""
            const id = this.extractAlbumId(href)
            if (!id) continue
            const styleFromHref = this.albumStyleFromHref(href, id)
            if (styleFromHref === "html") this.albumUrlStyle[id] = "html"
            if (styleFromHref === "bare") this.albumUrlStyle[id] = this.albumUrlStyle[id] || "bare"
            const safeStyle = this.albumUrlStyle[id] || styleFromHref || (this.isCodeLikeBareAlbumId(id) ? "bare" : "html")
            const container = this.nearestAlbumContainer(link)
            const draft = drafts[id] ?? {
                id,
                title: "",
                cover: "",
                tags: [],
                models: [],
                vendors: [],
                imageCount: null,
                detailUrl: this.absoluteUrl(this.detailPath(id, 1, safeStyle))
            }
            const linkTitle = this.cleanText(link.attributes?.title || link.text)
            const headingTitle = this.cleanText(container?.querySelector?.("h1, h2, h3, h4, h5, h6, .title")?.text)
            if (!draft.title) draft.title = linkTitle || headingTitle
            if (!draft.cover) draft.cover = this.firstImageUrl(container ?? link)
            draft.imageCount = draft.imageCount ?? this.cardImageCount(container, link, doc, draft.title || linkTitle || headingTitle)
            draft.models = Array.from(new Set([...draft.models, ...this.linkValuesByPath(container ?? link, ["/actor/", "actor/", "/model", "model/"])]))
            draft.vendors = Array.from(new Set([...draft.vendors, ...this.linkValuesByPath(container ?? link, ["/company/", "company/", "/vendor", "vendor/"])]))
            draft.tags = Array.from(new Set([...draft.tags, ...this.linkValuesByPath(container ?? link, ["/category/", "category/", "/tag", "tag/"])]))
            drafts[id] = draft
        }
        return Object.values(drafts)
            // Venera's list UI is not tolerant of null/undefined core fields.
            // Skip title-only false positives so category paging cannot crash with
            // "type 'Null' is not a subtype of type 'String'" when a card has no cover.
            .filter((item) => item.id && item.title && item.cover)
            .map((item) => {
                const count = Number(item.imageCount ?? 0)
                const tags = [...item.vendors, ...item.models, ...item.tags]
                    .map((value) => this.cleanText(value))
                    .filter((value, index, list) => value && list.indexOf(value) === index)
                const comic = {
                    id: String(item.id),
                    title: String(item.title || item.id),
                    subtitle: String(item.models.length ? item.models.join(", ") : (item.vendors[0] || "V2PH")),
                    cover: String(item.cover),
                    tags,
                    description: String(count > 0 ? `${count}P` : (item.detailUrl || "V2PH")),
                    language: "image"
                }
                if (count > 0) comic.maxPage = count
                return comic
            })
    }

    isRelatedHeadingText(text) {
        const value = this.cleanText(text).toLowerCase()
        if (!value) return false
        return value.includes("related galleries") ||
            value.includes("related gallery") ||
            value.includes("related albums") ||
            value.includes("related album") ||
            value.includes("相关写真") ||
            value.includes("相關寫真") ||
            value.includes("相关图集") ||
            value.includes("相關圖集") ||
            value.includes("相关推荐") ||
            value.includes("相關推薦") ||
            value.includes("関連ギャラリー") ||
            value.includes("관련 갤러리")
    }

    relatedSectionRoots(doc) {
        const result = []
        const add = (node) => {
            if (node && !result.includes(node)) result.push(node)
        }
        for (const heading of doc?.querySelectorAll?.("h1, h2, h3, h4, h5, h6, .section-title, .title") ?? []) {
            if (!this.isRelatedHeadingText(heading.text)) continue
            // V2PH currently renders the recommendation cards immediately after a
            // localized "Related Galleries / 相关写真" heading. Prefer the sibling
            // card container, while keeping the heading parent as a markup fallback.
            add(heading.nextElementSibling)
            add(heading.parent)
        }
        return result
    }

    toRecommendComic(item) {
        const maxPage = Number(item?.maxPage ?? 0)
        const comic = new Comic({
            id: String(item?.id ?? ""),
            title: String(item?.title ?? item?.id ?? "V2PH"),
            subtitle: String(item?.subtitle ?? "V2PH"),
            cover: String(item?.cover ?? ""),
            tags: Array.isArray(item?.tags) ? item.tags : [],
            description: String(item?.description ?? (maxPage > 0 ? `${maxPage}P` : "V2PH")),
            language: "image",
            maxPage: maxPage > 0 ? maxPage : undefined
        })
        return comic
    }

    parseRelatedComics(doc, currentId) {
        const normalizedCurrentId = this.normalizeAlbumId(currentId)
        const result = []
        const seen = {}
        const collect = (root) => {
            if (!root?.querySelectorAll) return
            for (const item of this.parseAlbumList(root)) {
                const itemId = this.normalizeAlbumId(item?.id)
                if (!itemId || itemId === normalizedCurrentId || seen[itemId]) continue
                if (!item?.title || !item?.cover) continue
                seen[itemId] = true
                result.push(this.toRecommendComic(item))
            }
        }

        // Normal path: only parse the section below the recommendation heading.
        for (const root of this.relatedSectionRoots(doc)) collect(root)

        // Compatibility fallback: older/current V2PH templates still keep all
        // recommendation album links in the same detail document. The current album
        // and pagination links are removed by ID, so this does not require an extra
        // request and remains safe when the heading class or language changes.
        if (!result.length) collect(doc)

        // The live detail page currently exposes four cards. Keep a defensive cap so
        // an unexpected template change cannot flood the Venera detail page.
        return result.slice(0, 12)
    }

    detailImageCandidates(node) {
        if (!node) return []
        const attrs = node.attributes ?? {}
        const result = [
            attrs["data-src"],
            attrs["data-original"],
            attrs["data-original-src"],
            attrs["data-lazy-src"],
            attrs["data-lazy"],
            attrs["data-full"],
            attrs["data-url"],
            attrs["data-href"],
            attrs["data-image"],
            attrs["data-img"],
            attrs["data-large"],
            attrs["data-large_image"],
            attrs["data-zoom-image"],
            attrs["data-bg"],
            attrs["data-background"],
            attrs.href,
            attrs.poster,
            attrs.src,
            ...this.splitSrcset(attrs.srcset),
            ...this.splitSrcset(attrs["data-srcset"]),
            ...this.splitSrcset(attrs["data-lazy-srcset"]),
            ...this.cssImageUrls(attrs.style)
        ]

        // Some V2PH detail pages put real image URLs in non-standard data-* fields.
        // Scan image-like attributes generically so small albums do not lose the
        // last few images when the markup differs from .album-photo img[alt].
        for (const key of Object.keys(attrs)) {
            const lower = String(key).toLowerCase()
            if (!/(src|srcset|href|url|img|image|photo|cover|thumb|large|full|original|bg|background)/i.test(lower)) continue
            const value = attrs[key]
            if (/srcset/i.test(lower)) {
                result.push(...this.splitSrcset(value))
            } else {
                result.push(value)
            }
        }
        return result
    }


    rawDetailImageCandidatesFromText(text) {
        const source = this.normalizeEscapedUrl(String(text ?? "")
            .split("&quot;").join('"')
            .split("&#34;").join('"')
            .split("&#039;").join("'")
            .split("&apos;").join("'")
            .split("&lt;").join("<")
            .split("&gt;").join(">")
            .split("&amp;").join("&"))
        if (!source) return []

        // Keep raw HTML extraction conservative: only real detail-photo endpoints,
        // not /album/ cover images or recommendation covers.
        const values = []
        const patterns = [
            /https?:\/\/cdn\.v2ph\.[^'"<>\s\\]+\/photos\/[^'"<>\s\\]+?\.(?:jpe?g|png|webp|avif)(?:\?[^'"<>\s\\]+)?/ig,
            /\/\/cdn\.v2ph\.[^'"<>\s\\]+\/photos\/[^'"<>\s\\]+?\.(?:jpe?g|png|webp|avif)(?:\?[^'"<>\s\\]+)?/ig,
            /\/photos\/[^'"<>\s\\]+?\.(?:jpe?g|png|webp|avif)(?:\?[^'"<>\s\\]+)?/ig,
            /\/file\/[^'"<>\s\\]+?\.(?:jpe?g|png|webp|avif)(?:\?[^'"<>\s\\]+)?/ig,
            /\/uploads?\/[^'"<>\s\\]+?\.(?:jpe?g|png|webp|avif)(?:\?[^'"<>\s\\]+)?/ig
        ]
        for (const pattern of patterns) {
            let match = null
            pattern.lastIndex = 0
            while ((match = pattern.exec(source)) !== null) {
                values.push(match[0])
            }
        }
        return values
    }


    imageInsideNonAlbumArea(node) {
        let current = node
        for (let depth = 0; depth < 10 && current; depth++) {
            const classes = this.classList(current).join(" ").toLowerCase()
            const id = String(current.id ?? "").toLowerCase()
            const marker = `${classes} ${id}`
            if (marker.includes("related") ||
                marker.includes("recommend") ||
                marker.includes("sidebar") ||
                marker.includes("widget") ||
                marker.includes("avatar") ||
                marker.includes("advert") ||
                marker.includes(" ad-") ||
                marker.includes("ads") ||
                marker.includes("footer") ||
                marker.includes("navbar") ||
                marker.includes("nav-bar") ||
                marker.includes("menu")) {
                return true
            }
            current = current.parent
        }
        return false
    }

    isLikelyDetailPhotoUrl(url) {
        const value = String(url ?? "").toLowerCase()
        return value.includes("/photos/") || value.includes("/file/") || value.includes("/uploads/")
    }

    rawAlbumScopedText(doc) {
        const raw = String(doc?._rawBody ?? "")
        const sourceUrl = String(doc?._sourceUrl ?? "")
        let source = raw
        if (!source && sourceUrl && this.rawBodyCache[sourceUrl]) source = String(this.rawBodyCache[sourceUrl] ?? "")
        if (!source) return ""

        // Only inspect the actual album image block.  Do not scan the whole HTML:
        // V2PH places Related Galleries immediately after the album photos, and a
        // full-page regex will collect unrelated albums.
        const lower = source.toLowerCase()
        const starts = [
            lower.indexOf('class="photos-list'),
            lower.indexOf("class='photos-list"),
            lower.indexOf('class="album-photos'),
            lower.indexOf("class='album-photos"),
            lower.indexOf('class="album-photo'),
            lower.indexOf("class='album-photo")
        ].filter((value) => value >= 0)
        if (!starts.length) return ""
        const start = Math.min(...starts)
        const tail = source.slice(start)
        const tailLower = lower.slice(start)
        const endMarkers = [
            '<h2', '<h3', 'related galleries', 'related-galleries',
            'class="related', "class='related", 'class="recommend', "class='recommend",
            '<aside', '<footer', 'id="footer', "id='footer"
        ]
        let end = tail.length
        for (const marker of endMarkers) {
            const idx = tailLower.indexOf(marker)
            if (idx > 0 && idx < end) end = idx
        }
        return tail.slice(0, end)
    }

    rawAlbumScopedImageCandidates(doc) {
        const text = this.rawAlbumScopedText(doc)
        if (!text) return []
        return this.rawDetailImageCandidatesFromText(text)
    }

    extractDetailImages(doc) {
        const images = []
        const seen = {}
        const add = (raw) => {
            const url = this.imageUrl(raw)
            if (!url) return
            if (!this.isLikelyDetailPhotoUrl(url)) return
            if (!seen[url]) {
                seen[url] = true
                images.push(url)
            }
        }

        // Keep detail extraction album-scoped.  Primary logic follows the V2PH
        // userscript rule: `.album-photo img[alt]`.  The only fallback below is a
        // raw-HTML scan of the same album block, used for 11-19P albums where page 2
        // may contain lazy URLs that HtmlDocument does not expose as img attributes.
        const strictSelectors = [
            ".album-photo img[alt]",
            ".photos-list .album-photo img",
            ".album-photos .album-photo img",
            ".photos-list img[alt]",
            ".album-photos img[alt]"
        ]
        for (const selector of strictSelectors) {
            for (const node of doc.querySelectorAll(selector)) {
                if (this.imageInsideNonAlbumArea(node)) continue
                for (const candidate of this.detailImageCandidates(node)) add(candidate)
            }
            if (images.length) return images
        }

        const albumRoots = [
            doc.querySelector(".photos-list"),
            doc.querySelector(".album-photos")
        ].filter((root, index, list) => root && list.indexOf(root) === index)

        const scopedSelector = [
            "img[src]",
            "img[data-src]",
            "img[data-original]",
            "img[data-original-src]",
            "img[data-lazy-src]",
            "img[srcset]",
            "img[data-srcset]",
            "source[srcset]",
            "source[data-srcset]",
            "a[href*='/photos/']",
            "a[href*='/file/']",
            "a[href*='cdn.v2ph']",
            "[data-full]",
            "[data-url]",
            "[data-href]",
            "[data-image]",
            "[data-large]",
            "[data-large_image]"
        ].join(", ")

        for (const root of albumRoots) {
            for (const node of root.querySelectorAll(scopedSelector)) {
                if (this.imageInsideNonAlbumArea(node)) continue
                for (const candidate of this.detailImageCandidates(node)) add(candidate)
            }
        }
        if (images.length) return images

        // Targeted fallback: scan only the raw album-photo/photos-list block, never
        // body/script/full HTML.  This is the minimal fix for small 13P/15P albums
        // without reintroducing unrelated images from Related Galleries.
        for (const candidate of this.rawAlbumScopedImageCandidates(doc)) add(candidate)
        return images
    }

    countDetailPagePhotos(doc) {
        // Keep this aligned with the userscript V2PH rule:
        // pagePicNum = document.querySelectorAll(".album-photo img[alt]").length.
        // Do NOT count div.album-photo wrappers: on 11-15P albums the wrapper count can
        // equal the total album count while only 9/10 actual image URLs are present on
        // page 1. That makes Math.ceil(total / pagePicNum) become 1 and skips page 2.
        const selectorGroups = [
            ".album-photo img[alt]",
            ".photos-list .album-photo img",
            ".album-photos .album-photo img",
            "div.album-photo img",
            ".photos-list img[alt]",
            ".album-photos img[alt]"
        ]
        for (const selector of selectorGroups) {
            const nodes = doc.querySelectorAll(selector)
            if (!nodes.length) continue
            const seen = {}
            let count = 0
            for (const image of nodes) {
                const candidates = this.detailImageCandidates(image)
                let url = ""
                for (const candidate of candidates) {
                    url = this.imageUrl(candidate)
                    if (url) break
                }
                const key = url || `node-${count}`
                if (!seen[key]) {
                    seen[key] = true
                    count += 1
                }
            }
            if (count > 0) return count
        }
        return this.extractDetailImages(doc).length
    }

    effectiveFirstPagePhotoCount(domCount, extractedCount, expectedCount = 0) {
        const dom = Number(domCount ?? 0)
        const extracted = Number(extractedCount ?? 0)
        const expected = Number(expectedCount ?? 0)

        // The safest page size is the number of image URLs actually extracted from
        // page 1. For small albums, DOM wrapper counts can be total placeholders, not
        // current-page photos.
        if (extracted > 0) return extracted
        if (dom > 0 && expected > 0 && dom >= expected) return Math.max(1, Math.min(dom, expected - 1))
        if (dom > 0) return dom
        return 1
    }

    hasPhotosList(doc) {
        return doc.querySelector(".photos-list") != null || doc.querySelector(".album-photos") != null
    }

    extractNumbers(text) {
        const values = []
        const source = String(text ?? "")
        const pattern = /\d+/g
        let match = null
        while ((match = pattern.exec(source)) !== null) {
            const value = Number(match[0])
            if (value > 0 && value < 10000) values.push(value)
        }
        return values
    }

    addPhotoCountMatches(values, text) {
        const source = this.cleanText(text)
        const patterns = [
            /(?:Photos?|圖片|图片|写真|圖|图)\s*[:：]?\s*P?\s*(\d+)/ig,
            /(\d+)\s*(?:Photos?|pics?|pictures?|圖片|图片|写真|圖|图)\b/ig,
            /[\[【(（][^\]】)）]*?(\d+)\s*P(?:hotos?)?[^\]】)）]*?[\]】)）]/ig,
            /\b(\d+)\s*P\b/ig
        ]
        for (const pattern of patterns) {
            let match = null
            pattern.lastIndex = 0
            while ((match = pattern.exec(source)) !== null) {
                const value = Number(match[1])
                if (value > 0 && value < 10000) values.push(value)
            }
        }
    }

    extractExpectedCount(doc, firstPageImageCount = 0) {
        const values = []
        const pageSize = Number(firstPageImageCount ?? 0)

        // Prefer explicit Photos/P count in the album information area. Do not scan
        // generic .content/body: V2PH puts Related Galleries after the current album
        // and those titles contain 40P/100P/etc.
        for (const node of doc.querySelectorAll("dl, .album-info, .album-detail, .detail")) {
            this.addPhotoCountMatches(values, node.text)
        }

        // Last-resort compatibility with older V2PH markup where dd:last-child was
        // the photo count.  Only accept it when it is plausible for the current page.
        const dd = doc.querySelectorAll("dd")
        if (dd.length) {
            const ddText = this.cleanText(dd[dd.length - 1].text)
            const ddNumbers = this.extractNumbers(ddText)
            for (const value of ddNumbers) {
                if (!pageSize || value >= pageSize) values.push(value)
            }
        }

        const titleText = this.cleanText(doc.querySelector("title")?.text)
        const ogTitle = this.cleanText(doc.querySelector("meta[property='og:title']")?.attributes?.content)
        this.addPhotoCountMatches(values, `${titleText} ${ogTitle}`)

        const strongValues = values
            .map((value) => Number(value))
            .filter((value) => value > 0 && value < 10000)

        if (!strongValues.length) return null

        // The real total must normally be at least the first page image count.
        // If every candidate is smaller than one full page, treat it as unreliable.
        const reliable = pageSize > 0 ? strongValues.filter((value) => value >= pageSize) : strongValues
        if (reliable.length) return Math.max(...reliable)
        return Math.max(...strongValues)
    }


    async getAlbumDocumentWithFallback(id, page = 1, referer = this.siteUrl, preferredStyle = "") {
        const albumId = this.normalizeAlbumId(id)
        let lastError = null
        for (const candidate of this.detailPathCandidates(albumId, page, preferredStyle)) {
            const url = this.absoluteUrl(candidate.path)
            try {
                const doc = await this.getDocumentWithRetry(url, referer, 2)
                this.albumUrlStyle[albumId] = candidate.style
                return { doc, url, style: candidate.style }
            } catch (error) {
                lastError = error
                // Only fall back between .html and bare URL on real 404/page-not-found.
                // Login, Cloudflare, VIP, timeout and DOM errors should surface normally.
                const message = String(error)
                if (!message.includes("HTTP 404") && !message.includes("Page not found") && !message.includes("detailUrlInvalid")) {
                    throw error
                }
            }
        }
        throw lastError ?? `V2PH album page not found: ${albumId}`
    }

    documentBelongsToAlbum(doc, id) {
        if (this.looksLikePageNotFound(doc)) return false
        const albumId = this.normalizeAlbumId(id).toLowerCase()
        const urls = [
            doc.querySelector("link[rel='canonical']")?.attributes?.href,
            doc.querySelector("meta[property='og:url']")?.attributes?.content,
            doc.querySelector("meta[name='twitter:url']")?.attributes?.content
        ].filter((value) => value)
        let sawAlbumUrl = false
        for (const url of urls) {
            const value = String(url ?? "")
            if (!/\/album\//i.test(value)) continue
            sawAlbumUrl = true
            const foundId = this.extractAlbumId(value).toLowerCase()
            if (foundId && foundId === albumId) return true
        }
        if (sawAlbumUrl) return false
        return true
    }

    async getAlbumDocumentWithImagesFallback(id, page = 1, referer = this.siteUrl, preferredStyle = "", knownImages = []) {
        const albumId = this.normalizeAlbumId(id)
        const known = {}
        for (const image of knownImages ?? []) known[image] = true
        let lastError = null
        let bestResult = null
        let emptyResult = null

        const candidateList = []
        const addCandidate = (candidate) => {
            if (!candidate?.path) return
            if (!candidateList.some((item) => item.path === candidate.path)) candidateList.push(candidate)
        }
        if (page > 1 && /\/album\//i.test(String(referer ?? ""))) {
            const refererPath = this.pathWithQueryFromUrl(referer).split("?")[0]
            addCandidate({ path: this.pageParamPath(refererPath, page), style: preferredStyle || this.albumUrlStyle[albumId] || "html" })
        }
        for (const candidate of this.detailPathCandidates(albumId, page, preferredStyle)) addCandidate(candidate)

        for (const candidate of candidateList) {
            const url = this.absoluteUrl(candidate.path)
            let doc = null
            try {
                // Detail pagination is best-effort and can be numerous on long albums.
                // Avoid per-candidate retry here; retrying every page/style makes 100P+ albums extremely slow.
                doc = await this.getDocumentWithRetry(url, referer, 0)
                if (this.looksLikePageNotFound(doc)) {
                    doc.dispose()
                    doc = null
                    lastError = `V2PH HTTP 404: ${url}`
                    continue
                }
                if (!this.documentBelongsToAlbum(doc, albumId)) {
                    doc.dispose()
                    doc = null
                    lastError = `V2PH detailUrlInvalid: ${url}`
                    continue
                }
                if (this.looksLikeLoginRequired(doc)) {
                    throw "V2PH login is required. Use Login with webview from this source account settings."
                }
                const images = this.extractDetailImages(doc)
                if (images.length) {
                    const newCount = images.filter((image) => !known[image]).length
                    const result = { doc, url, style: candidate.style, images }
                    doc = null
                    if (newCount > 0) {
                        bestResult?.doc?.dispose()
                        this.albumUrlStyle[albumId] = candidate.style
                        return result
                    }
                    if (!bestResult) {
                        bestResult = result
                    } else {
                        result.doc.dispose()
                    }
                    continue
                }
                if (!emptyResult) {
                    emptyResult = { doc, url, style: candidate.style, images: [] }
                    doc = null
                }
            } catch (error) {
                lastError = error
                const message = String(error)
                if (!message.includes("HTTP 404") && !message.includes("Page not found") && !message.includes("detailUrlInvalid")) {
                    // Try other known URL styles before surfacing a soft parse issue.
                    if (message.includes("Cloudflare") || message.includes("login") || message.includes("403")) throw error
                }
            } finally {
                doc?.dispose()
            }
        }

        if (bestResult) {
            this.albumUrlStyle[albumId] = bestResult.style
            return bestResult
        }
        if (emptyResult) return emptyResult
        throw lastError ?? `V2PH album page not found: ${albumId}`
    }

    detailPageNumbers(doc, id) {
        const pages = new Set()
        pages.add(1)
        const normalizedId = this.normalizeAlbumId(id)
        const escapedId = normalizedId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const sameAlbumPattern = new RegExp("/album/" + escapedId + "(?:\\.html)?(?:[/?#]|$)", "i")

        for (const link of doc.querySelectorAll("a[href]")) {
            const href = String(link.attributes?.href ?? "").trim()
            const text = this.cleanText(link.text)
            const classes = this.classList(link).join(" ").toLowerCase()
            const parentClasses = this.classList(link.parent).join(" ").toLowerCase()
            const isPager = classes.includes("page") ||
                classes.includes("pagination") ||
                parentClasses.includes("page") ||
                parentClasses.includes("pagination") ||
                /^(first|prev|next|last)$/i.test(text)

            // Be stricter than the previous version.  `href="#"` is common in
            // tabs/lightboxes/recommendation blocks; treating it as same-album
            // pagination can invent a non-existent page 4+ and trigger 404 reads.
            const sameAlbum = sameAlbumPattern.test(href) || /^[?&]page=\d+/i.test(href) || /^\?[^#]*[?&]?page=\d+/i.test(href)
            if (!sameAlbum) continue
            if (!isPager && !/[?&]page=\d+/i.test(href) && !/\/album\/[^/?#]+\/\d+\.html/i.test(href)) continue

            const queryPage = Number(/[?&]page=(\d+)/i.exec(href)?.[1] ?? "0")
            const pathPage = Number(/\/album\/[^/?#]+\/(\d+)\.html/i.exec(href)?.[1] ?? "0")
            const textPage = isPager && /^\d+$/.test(text) ? Number(text) : 0
            for (const page of [queryPage, pathPage, textPage]) {
                if (page > 0 && page < 10000) pages.add(page)
            }
        }
        return Array.from(pages).sort((left, right) => left - right)
    }

    looksLikeVipLimited(doc) {
        const body = this.cleanText(doc?.body?.text).toLowerCase()
        if (body.includes("vip限定") || body.includes("vip only") || body.includes("vip required") || body.includes("upgrade to vip")) return true
        for (const node of doc.querySelectorAll("div.lead, .lead, .alert, .notice")) {
            const text = this.cleanText(node.text).toLowerCase()
            if (text.includes("vip")) return true
        }
        return false
    }

    detailFetchLimit(doc, id, expectedCount, firstPageImageCount) {
        const count = Number(expectedCount ?? 0)
        const pageSize = Number(firstPageImageCount ?? 0)
        const linkedMax = Math.max(1, ...this.detailPageNumbers(doc, id))

        if (count > 0 && pageSize > 0) {
            // Main strategy is still the userscript-compatible total/page-size
            // calculation.  However, when the real detail pager exposes 3+ pages,
            // use it as an upper bound.  This prevents false totals or under-counted
            // first pages from probing non-existent `/page=4` / `/4.html` URLs while
            // keeping albums with only a "next/page 2" link from being prematurely cut.
            let calculated = Math.ceil(count / pageSize)
            if (linkedMax >= 3 && calculated > linkedMax) calculated = linkedMax
            return Math.min(Math.max(1, calculated, count > pageSize ? 2 : 1), 500)
        }

        return Math.min(Math.max(1, linkedMax), 20)
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    imageLoadConfig(url, referer, attempt = 0) {
        const target = this.imageUrl(url) || String(url ?? "")
        const safeTarget = target || "https://www.v2ph.com/img/favicon.svg"
        const headers = this.imageHeadersFor(safeTarget, referer)
        if (attempt > 0) {
            headers["Cache-Control"] = "no-cache"
            headers["Pragma"] = "no-cache"
        }
        const config = {
            url: safeTarget,
            headers
        }
        if (attempt < 1) {
            config.onLoadFailed = () => this.imageLoadConfig(safeTarget, referer, attempt + 1)
        }
        return config
    }

    detailFetchConcurrency(fetchLimit) {
        const limit = Number(fetchLimit ?? 1)
        if (limit >= 80) return 5
        if (limit >= 30) return 4
        if (limit >= 8) return 3
        return 2
    }

    isHardDetailPageError(error) {
        const message = String(error ?? "").toLowerCase()
        return message.includes("cloudflare") ||
            message.includes("login") ||
            message.includes("403") ||
            message.includes("quota") ||
            message.includes("vip")
    }

    async fetchDetailPageImages(id, page, referer, style, knownImages) {
        let pageDoc = null
        try {
            const pageResult = await this.getAlbumDocumentWithImagesFallback(id, page, referer, style, knownImages)
            pageDoc = pageResult.doc
            const images = pageResult.images?.length ? pageResult.images : this.extractDetailImages(pageDoc)
            const pagePhotoCount = this.countDetailPagePhotos(pageDoc)
            const pageExpected = this.extractExpectedCount(pageDoc, pagePhotoCount || images.length)
            const vipLimited = this.looksLikeVipLimited(pageDoc)
            const hasPhotos = this.hasPhotosList(pageDoc) || images.length > 0
            return {
                page,
                style: pageResult.style || style,
                url: pageResult.url || "",
                images,
                pagePhotoCount,
                pageExpected,
                vipLimited,
                hasPhotos,
                error: null
            }
        } catch (error) {
            if (this.isHardDetailPageError(error)) throw error
            return {
                page,
                style,
                url: "",
                images: [],
                pagePhotoCount: 0,
                pageExpected: 0,
                vipLimited: false,
                hasPhotos: false,
                error: String(error ?? "")
            }
        } finally {
            pageDoc?.dispose()
        }
    }

    parseDetail(doc, id) {
        if (this.looksLikePageNotFound(doc)) {
            throw "V2PH detailUrlInvalid: opened page is Page not found."
        }
        if (this.looksLikeLoginRequired(doc)) {
            throw "V2PH login is required. Use Login with webview from this source account settings."
        }
        if (!this.hasPhotosList(doc)) {
            throw "No V2PH photos-list found. The page may still be behind Cloudflare/login, or the detail DOM changed."
        }
        const normalizedId = this.normalizeAlbumId(id)
        const root = doc.querySelector("main") ?? doc.querySelector("article") ?? doc.body
        const title = this.cleanText(root?.querySelector?.("h1")?.text ||
            doc.querySelector("meta[property='og:title']")?.attributes?.content ||
            doc.querySelector("title")?.text ||
            normalizedId).replace(/\s*-\s*V2PH\s*$/i, "")
        const meta = this.extractDetailMetadata(doc)
        const vendors = this.uniqueValues([...meta.vendors, ...this.linkValuesByPath(root, ["/company/", "company/", "/vendor", "vendor/"], "Vendor")])
        const models = this.uniqueValues([...meta.models, ...this.linkValuesByPath(root, ["/actor/", "actor/", "/model", "model/"], "Model")])
        const tags = this.uniqueValues([...meta.tags, ...this.linkValuesByPath(root, ["/category/", "category/", "/tag", "tag/"], "Tags")])
        const images = this.extractDetailImages(doc)
        const pageImageCount = this.countDetailPagePhotos(doc) || images.length
        const expectedCount = meta.imageCount || this.extractExpectedCount(doc, pageImageCount) || images.length
        const related = this.parseRelatedComics(doc, normalizedId)
        if (!images.length) {
            throw "No V2PH images found. The page may still be behind Cloudflare/login, or the detail DOM changed."
        }
        return {
            title,
            subtitle: models.join(", ") || vendors.join(", "),
            cover: images[0],
            description: this.absoluteUrl(this.detailPath(normalizedId, 1, this.albumUrlStyle[normalizedId] || "html")),
            tags: {
                "Vendor": vendors,
                "Model": models,
                "Tags": tags,
                "Source": ["V2PH"]
            },
            chapters: {
                "main": "Photos"
            },
            thumbnails: images,
            recommend: related,
            uploadTime: "",
            updateTime: "",
            uploader: vendors[0] ?? "V2PH",
            url: this.absoluteUrl(this.detailPath(normalizedId, 1, this.albumUrlStyle[normalizedId] || "html")),
            maxPage: expectedCount,
            _expectedCount: expectedCount,
            stars: null
        }
    }

    async loadAlbumPage(path, page) {
        const currentPage = this.normalizePage(page, 1)
        const doc = await this.getDocument(path)
        try {
            const comics = this.parseAlbumList(doc)
            const parsedMaxPage = this.extractMaxPage(doc, currentPage)
            const totalCount = this.extractTotalListCount(doc)
            // V2PH category/tag/country/company/search list pages render 16 album
            // cards per page.  Use this fixed list page size for total-count based
            // maxPage so the first page immediately exposes the real jump range.
            const countBasedMaxPage = totalCount ? Math.ceil(totalCount / 16) : null
            const fallbackMaxPage = comics.length ? currentPage : 1
            return {
                comics,
                maxPage: Math.max(currentPage, parsedMaxPage ?? 0, countBasedMaxPage ?? 0, fallbackMaxPage)
            }
        } finally {
            doc.dispose()
        }
    }

    explore = [
        {
            title: "V2PH China",
            type: "multiPageComicList",
            load: async (page) => {
                const currentPage = this.normalizePage(page, 1)
                return this.loadAlbumPage(this.pageParamPath("/country/china", currentPage), currentPage)
            }
        },
        {
            title: "V2PH Japan",
            type: "multiPageComicList",
            load: async (page) => {
                const currentPage = this.normalizePage(page, 1)
                return this.loadAlbumPage(this.pageParamPath("/country/japan", currentPage), currentPage)
            }
        },
        {
            title: "V2PH Sexy",
            type: "multiPageComicList",
            load: async (page) => {
                const currentPage = this.normalizePage(page, 1)
                return this.loadAlbumPage(this.pageParamPath("/category/sexy-girls", currentPage), currentPage)
            }
        }
    ]

    search = {
        load: async (keyword, options, page) => {
            const cleanKeyword = this.cleanText(keyword)
            const currentPage = this.normalizePage(page, 1)
            if (!cleanKeyword) return { comics: [], maxPage: 1 }

            const categoryPath = this.categoryPathFor(cleanKeyword)
            if (categoryPath) {
                return this.loadAlbumPage(this.pageParamPath(categoryPath, currentPage), currentPage)
            }

            const query = encodeURIComponent(cleanKeyword)
            // V2PH's real website search endpoint is /search/?q=keyword.
            // Keep it first and preserve q when paging; other candidates are only compatibility fallbacks.
            const candidates = [
                this.pageParamPath(`/search/?q=${query}`, currentPage),
                this.pageParamPath(`/search?q=${query}`, currentPage),
                this.pageParamPath(`/search/?keyword=${query}`, currentPage),
                this.pageParamPath(`/search?keyword=${query}`, currentPage),
                this.pageParamPath(`/?q=${query}`, currentPage),
                this.pageParamPath(`/?s=${query}`, currentPage)
            ]
            const tried = {}
            let lastError = null
            for (const path of candidates) {
                if (tried[path]) continue
                tried[path] = true
                try {
                    const result = await this.loadAlbumPage(path, currentPage)
                    if (result.comics.length) return result
                } catch (error) {
                    lastError = error
                }
            }
            throw lastError ?? "No V2PH search result."
        },
        enableTagsSuggestions: false
    }

    category = {
        title: "V2PH Categories",
        parts: [
            {
                name: "热门标签",
                type: "fixed",
                itemType: "category",
                categories: ["性感美女", "女神", "短发", "清纯", "内衣美女", "嫩模", "日本嫩模", "Cosplay", "巨乳", "姐妹花", "死库水", "萝莉", "日本少妇", "日本少女", "人体艺术", "情趣内衣", "女优", "睡衣", "泳装", "日本女星", "网络美女", "海边美女", "花花公子", "PB写真集", "比基尼"],
                categoryParams: ["/category/sexy-girls", "/category/nvshen", "/category/short-hair", "/category/pure", "/category/underwear-beauty", "/category/glamour-models", "/category/japanese-gravure-models", "/category/cosplay", "/category/big-breasts", "/category/sister-duo", "/category/sukumizu", "/category/loli", "/category/japanese-young-women", "/category/japanese-girls", "/category/the-body-art", "/category/erotic-underwear", "/category/av-idols", "/category/nightdress", "/category/swimsuit", "/category/japanese-actresses", "/company/online-girls", "/category/beautiful-seaside", "/company/weekly-playboy", "/company/photo-book", "/category/bikini-girls"]
            },
            {
                name: "地区",
                type: "fixed",
                itemType: "category",
                categories: ["中国大陆", "日本", "韩国", "台湾", "泰国", "欧美"],
                categoryParams: ["/country/china", "/country/japan", "/country/south-korea", "/country/taiwan", "/country/thailand", "/country/europe"]
            }
        ],
        enableRankingPage: false
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            const path = String(param || this.categoryPathFor(category) || "")
            if (path.startsWith("/")) {
                const currentPage = this.normalizePage(page, 1)
                return this.loadAlbumPage(this.pageParamPath(path, currentPage), currentPage)
            }
            return this.search.load(category, options, page)
        }
    }

    comic = {
        idMatch: "^(?:https?://[^/]+)?/?album/[^/?#]+(?:/\\d+)?(?:\\.html)?(?:\\?page=\\d+)?$|^[A-Za-z0-9_-]+$",
        loadInfo: async (id) => {
            const normalizedId = this.normalizeAlbumId(id)
            const firstResult = await this.getAlbumDocumentWithFallback(normalizedId, 1, this.siteUrl, this.albumUrlStyle[normalizedId])
            const doc = firstResult.doc
            let firstUrl = firstResult.url
            let albumStyle = firstResult.style
            try {
                const detail = this.parseDetail(doc, normalizedId)
                detail.url = firstUrl
                const allImages = [...detail.thumbnails]
                const firstPageDomPhotoCount = this.countDetailPagePhotos(doc)
                let firstPageImageCount = this.effectiveFirstPagePhotoCount(firstPageDomPhotoCount, allImages.length, 0)
                let expectedCount = Number(this.extractExpectedCount(doc, firstPageImageCount) ?? detail._expectedCount ?? detail.maxPage ?? 0)
                const lockedExpectedCount = expectedCount > 0
                firstPageImageCount = this.effectiveFirstPagePhotoCount(firstPageDomPhotoCount, allImages.length, expectedCount)
                let fetchLimit = this.detailFetchLimit(doc, normalizedId, expectedCount, firstPageImageCount)

                // Some 11-15P albums expose only 9/10 images in the parsed first
                // page and put the remaining few images behind page=2, while the
                // total count may be absent or parsed as the first-page count.
                // In that exact range, always probe a small number of follow-up
                // pages. This keeps large albums on the normal total/pageSize
                // path but fixes short albums that previously stopped at 9/10.
                const forceProbeShortAlbum = allImages.length >= 8 && allImages.length <= 10
                if (expectedCount > firstPageImageCount && fetchLimit < 2) fetchLimit = 2
                // Only do the extra 3-page probe when the total count is missing or
                // unreliable. If a 13P/15P total is already known, probing page 3 is
                // exactly what can pull unrelated images after page 2.
                if (forceProbeShortAlbum && (!expectedCount || expectedCount <= allImages.length)) fetchLimit = Math.max(fetchLimit, 3)
                let duplicatePages = 0
                let nextPage = 2
                let stopPaging = false

                // Long albums were slow because pages were fetched strictly one by one,
                // with retry + delay on every page.  Fetch follow-up detail pages in
                // small batches: conservative enough for V2PH, but much faster for 80P+ albums.
                while (nextPage <= fetchLimit && !stopPaging) {
                    if (expectedCount > 0 && allImages.length >= expectedCount) break

                    const concurrency = this.detailFetchConcurrency(fetchLimit)
                    const batchPages = []
                    while (batchPages.length < concurrency && nextPage <= fetchLimit) {
                        if (expectedCount > 0 && allImages.length >= expectedCount) break
                        batchPages.push(nextPage)
                        nextPage += 1
                    }
                    if (!batchPages.length) break

                    const knownSnapshot = allImages.slice()
                    const batchResults = await Promise.all(batchPages.map((page) => this.fetchDetailPageImages(normalizedId, page, firstUrl, albumStyle, knownSnapshot)))
                    batchResults.sort((left, right) => left.page - right.page)

                    let batchNewImages = 0
                    for (const result of batchResults) {
                        if (result.vipLimited) {
                            UI.showMessage(`V2PH VIP-limited album: loaded ${allImages.length}${expectedCount ? "/" + expectedCount : ""}.`)
                            stopPaging = true
                            break
                        }

                        if (result.style) albumStyle = result.style
                        if (result.page === 2 && firstPageImageCount <= 0 && result.pagePhotoCount > 0) {
                            firstPageImageCount = this.effectiveFirstPagePhotoCount(result.pagePhotoCount, result.images.length, expectedCount)
                        }
                        if (!lockedExpectedCount && result.pageExpected) expectedCount = Math.max(expectedCount, Number(result.pageExpected))

                        const beforeCount = allImages.length
                        for (const image of result.images ?? []) {
                            if (!allImages.includes(image)) allImages.push(image)
                        }
                        const added = allImages.length - beforeCount
                        batchNewImages += added

                        const recalculatedLimit = this.detailFetchLimit(doc, normalizedId, expectedCount, firstPageImageCount || result.pagePhotoCount || result.images?.length || 1)
                        if (recalculatedLimit > fetchLimit) fetchLimit = recalculatedLimit

                        if (added === 0) {
                            duplicatePages += 1
                        } else {
                            duplicatePages = 0
                        }
                    }

                    if (expectedCount > 0 && allImages.length >= expectedCount) break
                    if (batchNewImages === 0) {
                        if (expectedCount > 0 && allImages.length < expectedCount) {
                            UI.showMessage(`V2PH had no new images in pages ${batchPages[0]}-${batchPages[batchPages.length - 1]}; loaded ${allImages.length}/${expectedCount}.`)
                        }
                        break
                    }
                    if (duplicatePages >= concurrency * 2) break
                }

                let finalImages = allImages
                    .map((image) => this.imageUrl(image) || String(image ?? ""))
                    .filter((image, index, list) => image && /^https?:\/\//i.test(image) && list.indexOf(image) === index)
                if (expectedCount > 0 && finalImages.length > expectedCount) finalImages = finalImages.slice(0, expectedCount)

                // Venera's client currently fixes the detail-page order as
                // Preview -> Related. A comic source cannot reorder those widgets.
                // Store complete images for loadEp, then return null thumbnails so
                // the oversized Preview section is omitted and Related appears
                // immediately after the preceding detail sections.
                this.readerImageCache[normalizedId] = finalImages
                this.readerImageCache[id] = finalImages
                detail.thumbnails = null
                detail._expectedCount = expectedCount || finalImages.length
                detail._completed = !expectedCount || finalImages.length >= expectedCount
                detail.maxPage = finalImages.length
                detail.cover = finalImages[0] || detail.cover || "https://www.v2ph.com/img/favicon.svg"
                detail.title = String(detail.title || normalizedId)
                detail.subtitle = String(detail.subtitle || "V2PH")
                detail.description = String(detail.description || detail.url || firstUrl)
                detail.uploadTime = String(detail.uploadTime || "")
                detail.updateTime = String(detail.updateTime || "")
                detail.uploader = String(detail.uploader || "V2PH")
                detail.url = String(detail.url || firstUrl || this.absoluteUrl(this.detailPath(normalizedId, 1, albumStyle)))
                if (expectedCount > 0 && finalImages.length < expectedCount) {
                    UI.showMessage(`V2PH images incomplete: loaded ${finalImages.length}/${expectedCount}. Tried .html, bare and /page.html detail pagination.`)
                }
                this.detailCache[normalizedId] = detail
                this.detailCache[id] = detail
                return detail
            } finally {
                doc.dispose()
            }
        },
        loadEp: async (id, ep) => {
            const normalizedId = this.normalizeAlbumId(id)
            const cachedDetail = this.detailCache[normalizedId] ?? this.detailCache[id]
            const cachedImages = this.readerImageCache[normalizedId] ??
                this.readerImageCache[id] ??
                cachedDetail?.thumbnails
            if (cachedImages?.length) {
                return { images: cachedImages.filter((image) => image && /^https?:\/\//i.test(String(image))) }
            }
            await this.comic.loadInfo(normalizedId)
            const loadedImages = this.readerImageCache[normalizedId] ?? this.readerImageCache[id] ?? []
            return { images: loadedImages.filter((image) => image && /^https?:\/\//i.test(String(image))) }
        },
        onImageLoad: async (imageKey, id, ep) => {
            const normalizedId = this.normalizeAlbumId(id)
            const style = this.albumUrlStyle[normalizedId] || "html"
            const referer = this.detailCache[normalizedId]?.url ?? this.absoluteUrl(this.detailPath(normalizedId, 1, style))
            return this.imageLoadConfig(this.imageUrl(imageKey) || imageKey, referer, 0)
        },
        onThumbnailLoad: (imageKey) => {
            const target = this.imageUrl(imageKey) || String(imageKey ?? "")
            return {
                url: target || "https://www.v2ph.com/img/favicon.svg",
                headers: this.imageHeadersFor(target || this.siteUrl, this.siteUrl)
            }
        },
        onClickTag: (namespace, tag) => {
            const normalized = this.tagNamespace(namespace)
            const mappedPath = this.storedTagLink(normalized, tag)
            if (mappedPath && (normalized === "Model" || normalized === "Vendor" || normalized === "Tags")) {
                return {
                    action: "category",
                    keyword: tag,
                    param: mappedPath
                }
            }
            return {
                action: "search",
                keyword: tag
            }
        },
        link: {
            domains: ["www.v2ph.com", "www.v2ph.net", "www.v2ph.ru", "www.v2ph.ovh"],
            linkToId: (url) => {
                return this.extractAlbumId(url)
            }
        }
    }

    translation = {
        "zh_CN": {
            "Cloudflare / login note": "Cloudflare / 登录说明",
            "Show note": "显示说明",
            "V2PH WebView session saved. Retry the source.": "V2PH WebView 会话已保存，请重试该图源。",
            "No V2PH cookies were captured. Complete Cloudflare verification in WebView and try again.": "没有捕获到 V2PH Cookie。请在 WebView 完成 Cloudflare 验证后重试。",
            "V2PH session cleared.": "V2PH 会话已清除。",
            "Vendor": "厂商",
            "Model": "模特",
            "Tags": "标签",
            "Source": "来源",
            "Open source account settings, use Login with webview, finish Cloudflare and V2PH login, then retry. This config does not bypass Cloudflare automatically.": "打开该源的账号设置，使用 Login with webview，完成 Cloudflare 和 V2PH 登录后重试。此配置不会自动绕过 Cloudflare。"
        },
        "zh_TW": {
            "Cloudflare / login note": "Cloudflare / 登入說明",
            "Show note": "顯示說明",
            "Vendor": "廠商",
            "Model": "模特",
            "Tags": "標籤",
            "Source": "來源"
        },
        "en": {}
    }
}

